package com.tally.app.money

import com.tally.app.personal.FOOD_GROUP_WEEKLY_TARGET_CENTS
import com.tally.app.personal.GOAL
import com.tally.app.recurring.monthlyEquivalentCents
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.max
import kotlin.math.roundToLong

/**
 * Tally — the one money model. Ported from src/money/index.ts (DESIGN-V4.md
 * §1, FROZEN).
 *
 *   Income  - Bills - Savings = To spend
 *   To spend - spent so far  = Left
 *   Left / days remaining    = per day
 *
 * Every other figure — left today, left this week, the category breakdown,
 * food this week, the deposit-plan projection — is a VIEW of this same pool,
 * derived here, never recomputed independently by a caller.
 *
 * WHY "SPENT" EXCLUDES COMMITTED-RECURRING TRANSACTIONS (read before touching
 * this): a rent payment already posted this month is counted once, as `Bills`
 * (the monthly-equivalent of every active recurring series) — it must NOT
 * also be counted a second time inside `spentCents`, or committed bills get
 * double-subtracted from what's left. This exact double-count was a
 * previously-fixed P0 in the web app's `safeToSpend.ts`; the fix (excluding
 * every txn id that belongs to a currently-ACTIVE, non-muted
 * `RecurringSeries.txnIds`) is reproduced here unchanged, not re-derived. A
 * MUTED series contributes nothing to `billsCents`, so its transactions
 * correctly fall through into ordinary `spentCents` once muted — every dollar
 * is counted exactly once, either as "committed" or as "already spent",
 * never both, never neither.
 *
 * DIVISION SAFETY: every division in this module goes through [safeDiv] or a
 * fixed, non-zero, non-data-dependent divisor. Nothing here can produce
 * NaN/Infinity — income unset, zero transactions, no recurring detected, a
 * past or future month, and the last day of the month are all exercised in
 * the test suite.
 */

data class MonthMoneyCategoryRow(
    val categoryId: String,
    val label: String,
    /** Design-token name (e.g. `"cat-3"`), never a raw hex. `"ink-3"` when the
     *  category id no longer resolves to a known category (deleted/unknown). */
    val colorToken: String,
    val spentCents: Cents
)

data class MonthMoneyFoodThisWeek(
    val weekStart: LocalDate,
    val weekEnd: LocalDate,
    /** 1..7, today counted as remaining (never 0). */
    val daysLeft: Int,
    /** PERSONAL.md §4's frozen $141/week headline. */
    val targetCents: Cents,
    val spentCents: Cents,
    /** targetCents - spentCents. Negative = over target. */
    val remainingCents: Cents,
    val groceriesCents: Cents,
    /** eating-out + lunch + coffee. */
    val awayCents: Cents
)

data class MonthMoneySavingsProgress(
    /** This month's Savings line — the same figure the equation subtracts. */
    val monthlyTargetCents: Cents,
    val goalTargetCents: Cents,
    val goalTargetDate: LocalDate,
    /** The plan's projected balance as of `today`, computed by re-running the SAME
     *  projection engine with `monthlyTargetCents` as its monthly contribution. */
    val projectedBalanceCents: Cents,
    /** The user's actual entered balance, or the projection when never entered. */
    val actualBalanceCents: Cents,
    /** False when [actualBalanceCents] is really [projectedBalanceCents] standing in. */
    val isBalanceUserEntered: Boolean,
    /** projectedBalanceCents - actualBalanceCents. Positive = behind plan. */
    val behindCents: Cents,
    val onTrack: Boolean,
    /** Whole days from `today` to `goalTargetDate`. Can be negative if the date has passed. */
    val daysUntilTarget: Int
)

data class MonthMoney(
    val month: YearMonth,
    val today: LocalDate,
    /** True when `settings.monthlyIncomeCents` is 0/unset — caller must show a
     *  prompt in the Income line, never a fake number. */
    val incomeUnset: Boolean,
    val incomeCents: Cents,
    /** Monthly-equivalent cost of active (non-muted) recurring series — rent,
     *  utilities, subscriptions. Single definition, reused from
     *  `com.tally.app.recurring`. */
    val billsCents: Cents,
    /** `settings.savingsTargetCents`, floored at 0. */
    val savingsCents: Cents,
    /** Income - Bills - Savings. The discretionary pool for the whole month. Can be negative. */
    val toSpendCents: Cents,
    /** Discretionary spend already logged this month — excludes committed-recurring transactions. */
    val spentCents: Cents,
    /** toSpendCents - spentCents. Can be negative. */
    val leftCents: Cents,
    /** Always >= 1 for the current month; 0 for a month that's already fully in the past. */
    val daysRemaining: Int,
    /** leftCents / daysRemaining, rounded to the nearest cent. */
    val leftTodayCents: Cents,
    /** 1..7 - days left in the Monday-Sunday week containing `today`. */
    val daysLeftInWeek: Int,
    /** leftTodayCents x daysLeftInWeek exactly - never recomputed independently. */
    val leftThisWeekCents: Cents,
    /** The breakdown of `spentCents`, largest first. Sums to `spentCents` exactly by construction. */
    val byCategory: List<MonthMoneyCategoryRow>,
    val foodThisWeek: MonthMoneyFoodThisWeek,
    val savingsProgress: MonthMoneySavingsProgress
)

data class ComputeMonthMoneyParams(
    val txns: List<Txn>,
    val recurring: List<RecurringSeries>,
    val settings: Settings,
    val categories: List<Category>,
    val month: YearMonth,
    val today: LocalDate
)

/**
 * Is this series a *bill* — something committed that should be reserved out of the
 * month before the user spends anything?
 *
 * Not everything the detector finds is a bill. Detection needs only three occurrences
 * at a regular interval, so a lunch spot visited three Tuesdays in a row gets picked up
 * — and used to be silently subtracted from "To spend" before the user had agreed it
 * was a commitment. A number that moves on its own, for a reason the user never
 * accepted, is exactly the kind of thing that makes an app impossible to trust.
 *
 * So: a bill is either something the user has confirmed, or something that repeats
 * monthly or less often. Every living cost in the plan — rent, utilities, phone,
 * health, subscriptions — is monthly or longer. A weekly or fortnightly habit is
 * discretionary spending, and belongs in `spentCents` where the user can see it, not
 * hidden inside the committed line.
 */
fun isBillSeries(series: RecurringSeries): Boolean {
    if (series.muted) return false
    if (series.confirmed) return true
    return series.cadence == RecurringCadence.MONTHLY ||
        series.cadence == RecurringCadence.QUARTERLY ||
        series.cadence == RecurringCadence.YEARLY
}

/**
 * Every txn id belonging to a currently-active (non-muted) recurring series — already
 * represented in `billsCents`, so it must be excluded from `spentCents` (and
 * `foodThisWeek`) everywhere, or the same dollar gets counted twice: once as a bill,
 * once as ordinary spend. Must mirror the bills filter (`isBillSeries`) exactly — a
 * series left out of bills but whose transactions are still excluded from spend would
 * make that money disappear from the month entirely.
 */
fun activeRecurringTxnIds(recurring: List<RecurringSeries>): Set<String> {
    val ids = mutableSetOf<String>()
    for (series in recurring) {
        if (!isBillSeries(series)) continue
        ids.addAll(series.txnIds)
    }
    return ids
}

fun computeMonthMoney(params: ComputeMonthMoneyParams): MonthMoney {
    val txns = params.txns
    val recurring = params.recurring
    val settings = params.settings
    val categories = params.categories
    val month = params.month
    val today = params.today

    val incomeCents = settings.monthlyIncomeCents
    val incomeUnset = incomeCents <= 0

    val activeSeries = recurring.filter(::isBillSeries)
    val billsCents = activeSeries.sumOf { monthlyEquivalentCents(it) }

    // Every txn id belonging to a currently-active series is already represented in
    // `billsCents` — exclude it from `spentCents` (and from `foodThisWeek`) so it is
    // never double-counted.
    val committedTxnIds = activeRecurringTxnIds(recurring)

    val savingsCents = max(0L, settings.savingsTargetCents)
    val toSpendCents = incomeCents - billsCents - savingsCents

    val monthTxns = txns.filter { t ->
        YearMonth.from(t.date) == month && !t.excluded && t.amountCents > 0 && !committedTxnIds.contains(t.id)
    }
    val spentCents = monthTxns.sumOf { it.amountCents }
    val leftCents = toSpendCents - spentCents

    val daysRemaining = daysRemainingInMonth(month, today)
    val leftTodayCents = safeDiv(leftCents.toDouble(), daysRemaining.toDouble(), 0.0).roundToLong()

    val week = weekWindowFor(today)
    val leftThisWeekCents = leftTodayCents * week.daysLeft

    val byCategory = buildCategoryBreakdown(monthTxns, categories)
    val foodThisWeek = buildFoodThisWeek(txns, committedTxnIds, week.weekStart, week.weekEnd, week.daysLeft)
    val savingsProgress = buildSavingsProgress(settings, savingsCents, today)

    return MonthMoney(
        month = month,
        today = today,
        incomeUnset = incomeUnset,
        incomeCents = incomeCents,
        billsCents = billsCents,
        savingsCents = savingsCents,
        toSpendCents = toSpendCents,
        spentCents = spentCents,
        leftCents = leftCents,
        daysRemaining = daysRemaining,
        leftTodayCents = leftTodayCents,
        daysLeftInWeek = week.daysLeft,
        leftThisWeekCents = leftThisWeekCents,
        byCategory = byCategory,
        foodThisWeek = foodThisWeek,
        savingsProgress = savingsProgress
    )
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

private fun buildCategoryBreakdown(monthTxns: List<Txn>, categories: List<Category>): List<MonthMoneyCategoryRow> {
    val catById = categories.associateBy { it.id }
    val totals = LinkedHashMap<String, Cents>()
    for (t in monthTxns) {
        totals[t.categoryId] = (totals[t.categoryId] ?: 0L) + t.amountCents
    }

    val rows = totals.entries.map { (categoryId, spentCents) ->
        val cat = catById[categoryId]
        MonthMoneyCategoryRow(
            categoryId = categoryId,
            label = cat?.label ?: categoryId,
            colorToken = cat?.colorToken ?: "ink-3",
            spentCents = spentCents
        )
    }

    return rows.sortedByDescending { it.spentCents }
}

private fun buildFoodThisWeek(
    txns: List<Txn>,
    committedTxnIds: Set<String>,
    weekStart: LocalDate,
    weekEnd: LocalDate,
    daysLeft: Int
): MonthMoneyFoodThisWeek {
    val targetCents = FOOD_GROUP_WEEKLY_TARGET_CENTS
    val totals = sumFoodGroupCents(txns, weekStart, weekEnd, committedTxnIds)
    return MonthMoneyFoodThisWeek(
        weekStart = weekStart,
        weekEnd = weekEnd,
        daysLeft = daysLeft,
        targetCents = targetCents,
        spentCents = totals.totalCents,
        remainingCents = targetCents - totals.totalCents,
        groceriesCents = totals.groceriesCents,
        awayCents = totals.awayCents
    )
}

private fun buildSavingsProgress(settings: Settings, monthlyTargetCents: Cents, today: LocalDate): MonthMoneySavingsProgress {
    // Reuse the goal feature's own compounding-projection engine rather than a second
    // one — but pass THIS month's live Savings line as its monthly contribution, so the
    // equation's Savings figure and the deposit plan's assumed contribution can never
    // drift apart.
    val projection = buildGoalProjection(monthlyTargetCents)
    val projectedBalanceCents = balanceAtDate(projection.input, projection.points, today)

    val stored = settings.goalCurrentBalanceCents
    val isBalanceUserEntered = stored != null
    val actualBalanceCents = stored ?: projectedBalanceCents

    val behindCents = projectedBalanceCents - actualBalanceCents

    return MonthMoneySavingsProgress(
        monthlyTargetCents = monthlyTargetCents,
        goalTargetCents = GOAL.targetCents,
        goalTargetDate = GOAL.targetDate,
        projectedBalanceCents = projectedBalanceCents,
        actualBalanceCents = actualBalanceCents,
        isBalanceUserEntered = isBalanceUserEntered,
        behindCents = behindCents,
        onTrack = behindCents <= 0,
        daysUntilTarget = daysBetween(today, GOAL.targetDate)
    )
}
