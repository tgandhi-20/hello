package com.tally.app.money

import com.tally.app.personal.AUGUST_2026_EVENTS
import com.tally.app.personal.EXPECTED_END_OF_AUGUST_CASH_CENTS
import com.tally.app.personal.GOAL
import com.tally.app.personal.INCOME
import com.tally.app.personal.PLANNED_ONE_OFFS
import com.tally.app.personal.PLAN_DEFAULTS
import com.tally.app.personal.PlannedOneOff
import com.tally.app.personal.SAVINGS_INTEREST_SCHEDULE
import com.tally.app.personal.STARTING_CASH_CENTS
import com.tally.app.personal.STARTING_CASH_DATE
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.max
import kotlin.math.min

/**
 * Deposit-goal projection engine. Ported from src/features/goal/projection.ts.
 * Pure — no store access.
 *
 * ===================================================================================
 * COMPOUNDING CONVENTION (read before changing any number in here) — copied verbatim
 * in substance from the TypeScript source:
 * ===================================================================================
 *
 * 1. NOMINAL annual rate / 12, not an effective monthly rate — matches how AU ADIs
 *    quote and apply savings rates on a statement.
 * 2. Interest for month M is computed on the OPENING balance (month M-1's close),
 *    before month M's contribution/one-off is applied. This slightly OVERSTATES
 *    interest in a month with a large withdrawal and slightly UNDERSTATES it in a
 *    month with only a deposit — a defensible, non-hidden simplification.
 * 3. `grossInterestCents`/`taxCents` are each rounded to the nearest cent every
 *    month, so `closingBalanceCents` is always an exact integer.
 *
 * TAX CONVENTION — this projection is POST-TAX: `netInterestCents = grossInterestCents
 * - round(grossInterestCents * marginalTaxRate)` is what actually compounds. See the
 * TS source's doc comment for the full reasoning (pre-tax reproduces the plan's
 * $72,339 target almost exactly; post-tax is the conservative, "actually spendable"
 * reading, and this module reports the gap rather than silently retuning to match).
 */

data class MonthlyProjectionPoint(
    val month: YearMonth,
    val openingBalanceCents: Cents,
    val annualRatePct: Double,
    /** Standard recurring contribution applied this month (0 in a zero-contribution what-if). */
    val contributionCents: Cents,
    /** Net signed effect of any one-off(s) landing this month: negative = withdrawal. */
    val oneOffCents: Cents,
    val oneOffLabels: List<String>,
    val grossInterestCents: Cents,
    val taxCents: Cents,
    /** What actually compounds into the balance. */
    val netInterestCents: Cents,
    val closingBalanceCents: Cents,
    val depositsCents: Cents,
    val withdrawalsCents: Cents,
    val withdrawalsExceedDeposits: Boolean
)

data class ProjectionInput(
    val startBalanceCents: Cents,
    /** The month whose END `startBalanceCents` represents — projection begins the month after. */
    val startMonth: YearMonth,
    val monthlyContributionCents: Cents,
    val oneOffs: List<PlannedOneOff>,
    val marginalTaxRate: Double,
    val monthsToProject: Int
)

val BASELINE_MONTH: YearMonth = YearMonth.from(STARTING_CASH_DATE)

private fun rateForMonth(month: YearMonth): Double {
    val monthStart = month.atDay(1)
    for (period in SAVINGS_INTEREST_SCHEDULE) {
        val afterFrom = period.from == null || !monthStart.isBefore(period.from)
        val beforeUntil = period.until == null || monthStart.isBefore(period.until)
        if (afterFrom && beforeUntil) return period.annualRatePct
    }
    return 0.0 // defensive fallback; the schedule covers all time as written
}

/** Simulate the account forward from `input.startMonth`'s end. Pure — same input, same
 *  output, every time. No division here can produce NaN/Infinity: rates/100/12 and
 *  ratios are always finite constants, and `dayFraction` (below) guards `total <= 1`. */
fun projectMonths(input: ProjectionInput): List<MonthlyProjectionPoint> {
    val points = mutableListOf<MonthlyProjectionPoint>()
    var balance = input.startBalanceCents
    var month = input.startMonth.plusMonths(1)

    val horizon = max(0, input.monthsToProject)
    repeat(horizon) {
        val opening = balance
        val annualRatePct = rateForMonth(month)
        val monthlyRate = annualRatePct / 100.0 / 12.0
        val grossInterestCents = Math.round(opening * monthlyRate)
        val taxCents = Math.round(grossInterestCents * input.marginalTaxRate)
        val netInterestCents = grossInterestCents - taxCents

        val oneOffsThisMonth = input.oneOffs.filter { it.month == month }
        val withdrawalsCents = oneOffsThisMonth.sumOf { max(0L, it.amountCents) }
        val oneOffCents = -withdrawalsCents
        val oneOffLabels = oneOffsThisMonth.map { it.label }

        val contributionCents = input.monthlyContributionCents
        val depositsCents = max(0L, contributionCents)

        val closingBalanceCents = opening + netInterestCents + contributionCents + oneOffCents

        points.add(
            MonthlyProjectionPoint(
                month = month,
                openingBalanceCents = opening,
                annualRatePct = annualRatePct,
                contributionCents = contributionCents,
                oneOffCents = oneOffCents,
                oneOffLabels = oneOffLabels,
                grossInterestCents = grossInterestCents,
                taxCents = taxCents,
                netInterestCents = netInterestCents,
                closingBalanceCents = closingBalanceCents,
                depositsCents = depositsCents,
                withdrawalsCents = withdrawalsCents,
                withdrawalsExceedDeposits = withdrawalsCents > depositsCents
            )
        )

        balance = closingBalanceCents
        month = month.plusMonths(1)
    }

    return points
}

/** Number of whole months from [from] to [to] (can be negative). */
fun monthsBetween(from: YearMonth, to: YearMonth): Int =
    (to.year * 12 + to.monthValue) - (from.year * 12 + from.monthValue)

/** The exact number of months a default (plan-defaults) projection needs to reach the
 *  month the target date falls in, counting from the end-of-August baseline. */
fun defaultHorizonMonths(): Int = max(0, monthsBetween(BASELINE_MONTH, YearMonth.from(GOAL.targetDate)))

fun defaultProjectionInput(
    startBalanceCents: Cents = EXPECTED_END_OF_AUGUST_CASH_CENTS,
    startMonth: YearMonth = BASELINE_MONTH,
    monthlyContributionCents: Cents = PLAN_DEFAULTS.savingsTargetCents,
    oneOffs: List<PlannedOneOff> = PLANNED_ONE_OFFS,
    marginalTaxRate: Double = INCOME.marginalRatePct / 100.0,
    monthsToProject: Int = defaultHorizonMonths()
): ProjectionInput = ProjectionInput(
    startBalanceCents, startMonth, monthlyContributionCents, oneOffs, marginalTaxRate, monthsToProject
)

data class GoalProjectionResult(
    val input: ProjectionInput,
    val points: List<MonthlyProjectionPoint>,
    /** Balance at `GOAL.targetDate`, linearly interpolated within its month by day-of-month. */
    val finalBalanceCents: Cents,
    val targetCents: Cents,
    val targetDate: LocalDate,
    /** finalBalanceCents - targetCents. Positive = ahead of target, negative = short. */
    val gapCents: Cents
)

/** Run the default (plan-figures) projection end to end and evaluate it against the
 *  plan's own $72,339 target. */
fun buildGoalProjection(monthlyContributionCents: Cents = PLAN_DEFAULTS.savingsTargetCents): GoalProjectionResult {
    val input = defaultProjectionInput(monthlyContributionCents = monthlyContributionCents)
    val points = projectMonths(input)
    val finalBalanceCents = balanceAtDate(input, points, GOAL.targetDate)
    return GoalProjectionResult(
        input, points, finalBalanceCents, GOAL.targetCents, GOAL.targetDate, finalBalanceCents - GOAL.targetCents
    )
}

/** Day-of-month as a 0..1 fraction through the month (day 1 -> 0, last day -> 1). Used
 *  only for interpolating a balance to a specific day, never for interest maths. */
private fun dayFraction(date: LocalDate): Double {
    val day = date.dayOfMonth
    val total = YearMonth.from(date).lengthOfMonth()
    if (total <= 1) return 0.0
    return max(0.0, min(1.0, (day - 1).toDouble() / (total - 1).toDouble()))
}

/** Reconstruct the plan's own running balance across August 2026 from its dated cashflow
 *  events. `CashEvent.amountCents` follows the Txn convention (positive = cash out), so
 *  each event SUBTRACTS from the running balance. */
fun augustRunningBalance(date: LocalDate): Cents {
    val monthEndDate = YearMonth.from(date).atEndOfMonth()
    var balance = STARTING_CASH_CENTS
    for (event in AUGUST_2026_EVENTS) {
        val effectiveDate = event.date ?: monthEndDate // undated events assumed to land at month-end
        if (!effectiveDate.isAfter(date)) balance -= event.amountCents
    }
    return balance
}

/**
 * Balance the plan expects on an arbitrary date, given a projection's [points]. Three
 * phases (see the TS source's extended doc comment):
 *   1. Before STARTING_CASH_DATE: the plan hasn't started — report starting cash as-is.
 *   2. Between STARTING_CASH_DATE and end of the start month: reconstruct from
 *      AUGUST_2026_EVENTS.
 *   3. From the month after onward: monthly-granularity points, linearly interpolated
 *      within a month by day-of-month.
 * Never NaN/Infinity: every branch returns a stored constant or a bounded interpolation.
 */
fun balanceAtDate(input: ProjectionInput, points: List<MonthlyProjectionPoint>, date: LocalDate): Cents {
    if (date.isBefore(STARTING_CASH_DATE)) return STARTING_CASH_CENTS

    val augustEnd = input.startMonth.plusMonths(1) // first month AFTER the baseline month
    if (date.isBefore(augustEnd.atDay(1))) return augustRunningBalance(date)

    if (points.isEmpty()) return input.startBalanceCents

    val targetMonth = YearMonth.from(date)
    if (targetMonth < points.first().month) return input.startBalanceCents

    val last = points.last()
    if (targetMonth > last.month) return last.closingBalanceCents

    val point = points.find { it.month == targetMonth } ?: return last.closingBalanceCents

    val frac = dayFraction(date)
    return Math.round(point.openingBalanceCents + (point.closingBalanceCents - point.openingBalanceCents) * frac)
}
