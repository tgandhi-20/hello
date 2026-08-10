package com.tally.app.money

import com.tally.app.personal.PLAN_DEFAULTS
import com.tally.app.recurring.cadenceNominalDays
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.max

/**
 * "Bills due soon" — Home's third section (DESIGN-V4.md §1/§3). Merges every
 * dated near-term event Tally can already compute into ONE list, soonest
 * first, windowed to the next [horizonDays] (default 14). Ported from
 * src/features/today/billsDueSoon.ts.
 *
 * SCOPE OF THIS PORT — read before assuming a kind is missing by accident.
 * The TS source merges FIVE event kinds by delegating to `buildCashflowCalendar`
 * (src/features/statements/upcoming.ts) and `closeDatesWithin`
 * (src/features/statements/cycle.ts). Neither of those has an Android home:
 * `docs/ANDROID-NATIVE.md` §2's module list has no `statements` package at
 * all, and the Android `RecurringSeries` (money/Types.kt) deliberately has no
 * `accountId` field (see recurring/Detect.kt's own "NOT PORTED" note), which
 * is the field card-linking depends on structurally, not just by omission
 * here. So:
 *   - `recurring` IS ported — every occurrence of every active series within
 *     the horizon, straight off `RecurringSeries.nextDue`/cadence.
 *   - `income` (salary) and `savings-transfer` ARE ported — both derive from
 *     `Settings` alone (payday, income, savings target) and a small local
 *     day-of-month roll-forward helper reproduced from
 *     `statements/dates.ts`'s `nextOnOrAfter`, which has no Android package
 *     to live in yet either.
 *   - `card-payment` and `statement-close` are NOT ported. They need
 *     `CycleInference` (statement-cycle inference from CSV history),
 *     `Settings.statementCycles`, and `RecurringSeries.accountId` — an entire
 *     feature engine (~560 lines of `cycle.ts` + `upcoming.ts`), not a money
 *     helper. Building that here would be re-deriving a feature outside this
 *     package's ownership (money/), which is exactly the drift this port is
 *     meant to avoid. When the `statements` feature lands on Android, this
 *     file's caller can compute those events itself and merge them in, or
 *     this function can grow a `cardEvents: List<BillDueSoonItem>` parameter.
 *   - The check suite this file ports its assertions from
 *     (src/features/today/__checks__/run.ts) only ever exercises `recurring`
 *     events in its fixtures (empty `txns`, no card accounts, no
 *     `statementCycles`) — every assertion there is satisfied by this scope.
 *
 * Pure function, no store/UI access — same convention as every other pure
 * module in `money/`.
 */

/** DESIGN-V4.md §1: "Bills due soon" — next 14 days. */
const val BILLS_DUE_SOON_HORIZON_DAYS: Int = 14

enum class BillDueSoonKind { RECURRING, CARD_PAYMENT, STATEMENT_CLOSE, INCOME, SAVINGS_TRANSFER }

/** 'SCHEDULED' = a fixed date Tally is confident about; 'PREDICTED' = projected from a
 *  detected/inferred cadence and could still shift a little. */
enum class BillDueSoonCertainty { SCHEDULED, PREDICTED }

data class BillDueSoonItem(
    val id: String,
    val date: LocalDate,
    val kind: BillDueSoonKind,
    val label: String,
    /** Signed like `Txn.amountCents` (positive = cash out). `null` when there's
     *  genuinely nothing to show — a statement close date has no amount of its
     *  own, it's a date, not a transaction (kept for shape parity with the TS
     *  type even though this port never emits that kind). */
    val amountCents: Cents?,
    val certainty: BillDueSoonCertainty
)

/** Stable same-day tie-break: cash events read before background-information
 *  markers. Keeps a re-render from ever visibly reshuffling rows sharing a date. */
private fun kindRank(kind: BillDueSoonKind): Int = when (kind) {
    BillDueSoonKind.INCOME -> 0
    BillDueSoonKind.SAVINGS_TRANSFER -> 1
    BillDueSoonKind.CARD_PAYMENT -> 2
    BillDueSoonKind.RECURRING -> 3
    BillDueSoonKind.STATEMENT_CLOSE -> 4
}

// ---------------------------------------------------------------------------
// Small day-of-month helpers, reproduced locally from statements/dates.ts —
// that file has no Android package to live in yet (see the class doc comment
// above), and this is the only slice of it this file needs.
// ---------------------------------------------------------------------------

/** [year]-[month]-[day], clamping [day] into the month's real length so a
 *  configured "31st" never overflows a short month. Mirrors dates.ts's
 *  `dateFromParts`. */
private fun dateFromParts(year: Int, month: Int, day: Int): LocalDate {
    val ym = YearMonth.of(year, month)
    return ym.atDay(day.coerceIn(1, ym.lengthOfMonth()))
}

/** The earliest date >= [fromInclusive] whose day-of-month is [dayOfMonth]
 *  (clamped per month). Mirrors dates.ts's `nextOnOrAfter`. */
private fun nextOnOrAfter(fromInclusive: LocalDate, dayOfMonth: Int): LocalDate {
    val candidate = dateFromParts(fromInclusive.year, fromInclusive.monthValue, dayOfMonth)
    return if (!candidate.isBefore(fromInclusive)) {
        candidate
    } else {
        val next = YearMonth.from(candidate).plusMonths(1)
        dateFromParts(next.year, next.monthValue, candidate.dayOfMonth)
    }
}

/**
 * Every occurrence of [series] within `[today, horizonEnd]` — not just the
 * next one; a weekly bill can occur more than once inside a 14-day window.
 * Mirrors `upcoming.ts`'s local `projectSeriesOccurrences`, INCLUDING its use
 * of a TRUNCATING day-step: JS's `date.setDate(date.getDate() + step)`
 * truncates a fractional `step` toward zero, it does not round. Reproduced
 * here with `step.toLong()` (Kotlin's `Double.toLong()` also truncates toward
 * zero) rather than `Math.round` — deliberately NOT reusing
 * `recurring.rollForwardDueDate`, which rounds: the two TS source functions
 * use different arithmetic for different purposes and this keeps that
 * distinction rather than silently unifying it.
 */
private fun projectSeriesOccurrences(series: RecurringSeries, today: LocalDate, horizonEnd: LocalDate): List<LocalDate> {
    if (series.muted) return emptyList()
    val step = cadenceNominalDays(series.cadence)
    // TS guards `Number.isFinite(step)` because its cadence table is looked up
    // by an untyped string key that could miss. `cadenceNominalDays` here is
    // typed over the closed `RecurringCadence` enum and always returns one of
    // five fixed, finite, positive constants — NaN/Infinity is structurally
    // impossible, so only the `step <= 0` half of that guard is meaningful.
    if (step <= 0) return emptyList()
    val stepDays = step.toLong()

    var d = series.nextDue
    var guard = 0
    while (d.isBefore(today) && guard < 80) {
        d = d.plusDays(stepDays)
        guard++
    }

    val dates = mutableListOf<LocalDate>()
    guard = 0
    while (!d.isAfter(horizonEnd) && guard < 80) {
        dates.add(d)
        d = d.plusDays(stepDays)
        guard++
    }
    return dates
}

/**
 * Build the merged, sorted, `[today, today+horizonDays]`-windowed "bills due
 * soon" list.
 *
 * [today] has no default — every caller must pass an explicit date, matching
 * this codebase's established convention for testable pure functions (see
 * `recurring.DetectionOptions.today`'s own doc comment) rather than the TS
 * source's `today = todayStr()` default, which hardcodes the real system
 * clock.
 */
fun buildBillsDueSoon(
    txns: List<Txn>,
    recurring: List<RecurringSeries>,
    settings: Settings,
    today: LocalDate,
    horizonDays: Int = BILLS_DUE_SOON_HORIZON_DAYS
): List<BillDueSoonItem> {
    // TS: `Number.isFinite(horizonDays) ? Math.max(0, horizonDays) : DEFAULT`.
    // `horizonDays` is an untyped `number` there and could arrive as
    // NaN/Infinity from a caller; Kotlin's `Int` cannot hold either, so the
    // `isFinite` half of that guard is structurally impossible here and is
    // intentionally not transcribed — only the `max(0, …)` floor survives.
    val safeHorizonDays = max(0, horizonDays)
    val horizonEnd = today.plusDays(safeHorizonDays.toLong())

    val items = mutableListOf<BillDueSoonItem>()

    // ---- Recurring charges (every occurrence projected within the horizon) ----
    for (series in recurring) {
        if (series.muted || series.amountCents == 0L) continue
        for (date in projectSeriesOccurrences(series, today, horizonEnd)) {
            items.add(
                BillDueSoonItem(
                    id = "${series.id}::$date",
                    date = date,
                    kind = BillDueSoonKind.RECURRING,
                    label = series.merchant,
                    amountCents = series.amountCents,
                    certainty = if (series.confirmed) BillDueSoonCertainty.SCHEDULED else BillDueSoonCertainty.PREDICTED
                )
            )
        }
    }

    // ---- Salary (docs/PERSONAL.md: "15th — salary lands") ----
    if (settings.monthlyIncomeCents > 0) {
        val paydayOfMonth = if (settings.paydayDayOfMonth != 0) settings.paydayDayOfMonth else PLAN_DEFAULTS.paydayDayOfMonth
        var payday = nextOnOrAfter(today, paydayOfMonth)
        var guard = 0
        while (!payday.isAfter(horizonEnd) && guard < 4) {
            items.add(
                BillDueSoonItem(
                    id = "salary-$payday",
                    date = payday,
                    kind = BillDueSoonKind.INCOME,
                    label = "Salary",
                    amountCents = -settings.monthlyIncomeCents,
                    certainty = BillDueSoonCertainty.SCHEDULED
                )
            )
            payday = nextOnOrAfter(payday.plusDays(1), paydayOfMonth)
            guard++
        }
    }

    // ---- Savings transfer (docs/PERSONAL.md: "16th — automatic transfer to savings") ----
    // TS falls back to `PLAN_DEFAULTS.autoTransferDayOfMonth` when
    // `Settings.transferToSavingsDayOfMonth` (a `routine` feature augmentation)
    // is unset. Android's `Settings` has no such override field at all yet, so
    // this always uses the plan default — equivalent to every caller that has
    // never set the override, which today is every caller.
    if (settings.savingsTargetCents > 0) {
        val transferDayOfMonth = PLAN_DEFAULTS.autoTransferDayOfMonth
        var transfer = nextOnOrAfter(today, transferDayOfMonth)
        var guard = 0
        while (!transfer.isAfter(horizonEnd) && guard < 4) {
            items.add(
                BillDueSoonItem(
                    id = "savings-transfer-$transfer",
                    date = transfer,
                    kind = BillDueSoonKind.SAVINGS_TRANSFER,
                    label = "Transfer to savings",
                    amountCents = settings.savingsTargetCents,
                    certainty = BillDueSoonCertainty.SCHEDULED
                )
            )
            transfer = nextOnOrAfter(transfer.plusDays(1), transferDayOfMonth)
            guard++
        }
    }

    // card-payment / statement-close: NOT PORTED — see the file doc comment.

    // Defensive re-window: every loop above already bounds its own output to
    // [today, horizonEnd], but the merge is asserted here too rather than
    // trusted blindly — matches the TS source's own defensive comment.
    return items
        .filter { !it.date.isBefore(today) && !it.date.isAfter(horizonEnd) }
        .sortedWith(compareBy<BillDueSoonItem> { it.date }.thenBy { kindRank(it.kind) }.thenBy { it.id })
}
