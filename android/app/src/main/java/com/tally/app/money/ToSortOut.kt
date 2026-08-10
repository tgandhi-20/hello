package com.tally.app.money

import com.tally.app.personal.CATEGORY_IDS
import com.tally.app.recurring.priceIncreases
import java.time.LocalDate

/**
 * "To sort out" — Home's fifth and only OPTIONAL section (DESIGN-V4.md
 * §1/§3). Surfaces exactly the things that genuinely need a human decision
 * right now. Ported from src/features/today/toSortOut.ts.
 *
 * "A section with nothing to say must not render" — this function is the
 * "nothing to say" test: when none of the below apply it returns an empty
 * list, and the UI must render nothing at all for an empty list (same
 * contract as the TS source).
 *
 * SCOPE OF THIS PORT — the TS source surfaces FOUR kinds of item:
 *   1. `uncategorised` transactions — PORTED. Uses only `Txn` +
 *      `CATEGORY_IDS.other` (personal/Plan.kt), both already on Android.
 *   2. `price-rise` on a recurring series — PORTED, reusing
 *      `recurring.priceIncreases` (recurring/Detect.kt) unchanged rather than
 *      re-deriving its filter.
 *   3. `unconfirmed-cycle` (a card statement cycle Tally can't confidently
 *      predict yet) — NOT PORTED. Needs `statements/cycle.ts`'s
 *      `effectiveCycle`/`CycleInference`, `Settings.statementCycles`, and
 *      `RecurringSeries.accountId` — none of which exist on Android (see
 *      `BillsDueSoon.kt`'s doc comment for the full reasoning; the same gap
 *      applies here). `ToSortOutKind.UNCONFIRMED_CYCLE` is kept in the enum
 *      for shape parity, but no code path in this file ever produces it yet.
 *   4. `routine` items due today or overdue — PARTIALLY PORTED. The `routine`
 *      feature (checklist state, `resolveMonthlyItems`) has no Android
 *      package either, so this file cannot resolve a month's routine items on
 *      its own. What IS ported, exactly, is the part that is this screen's
 *      own logic and the part the check suite actually pins down: the
 *      "vaultHasData" gate and the due/overdue filter. [ResolvedRoutineItem]
 *      is a small local shape a future `routine` port can produce; this
 *      function applies the SAME gate the TS source does — a brand-new
 *      install with zero transactions and zero recurring series must never
 *      show a routine item as "Overdue" just because a calendar date has
 *      passed. That bug shipped once in the web app (`Export & review
 *      statements — Overdue` on a completely empty vault); the fix
 *      (`vaultHasData = txns.length > 0 || recurring.length > 0`) is
 *      reproduced here unchanged, not re-derived, and is gated BEFORE looking
 *      at [resolvedRoutineItems] at all — so it holds even if a future caller
 *      passes resolved items in by mistake on an empty vault.
 *
 * Pure function, no store/UI access — same convention as every other pure
 * module in `money/`.
 */

enum class ToSortOutKind { UNCATEGORISED, PRICE_RISE, UNCONFIRMED_CYCLE, ROUTINE }

data class ToSortOutItem(
    val id: String,
    val kind: ToSortOutKind,
    val title: String,
    val subtitle: String,
    /** Only set for kinds that carry a figure worth showing (a price rise). */
    val amountCents: Cents? = null,
    /** Where tapping this row should take the user. */
    val to: String
)

/**
 * A monthly routine item already resolved against a month + today, matching
 * the shape `routine/types.ts`'s `ResolvedMonthlyRoutineItem` produces (minus
 * `detail`, which this screen never shows). A future Android `routine`
 * package supplies these; this file only applies the vault-data gate and the
 * due/overdue filter to whatever list it's given — see the class doc comment.
 */
data class ResolvedRoutineItem(
    val id: String,
    val label: String,
    val done: Boolean,
    val dueDate: LocalDate,
    val overdue: Boolean
)

/**
 * Build the "to sort out" list.
 *
 * [today] and [resolvedRoutineItems] have no default — every caller must pass
 * them explicitly, matching this codebase's established convention for
 * testable pure functions (see `recurring.DetectionOptions.today`'s own doc
 * comment) rather than the TS source's `today = todayStr()` default, which
 * hardcodes the real system clock.
 */
fun buildToSortOut(
    txns: List<Txn>,
    recurring: List<RecurringSeries>,
    resolvedRoutineItems: List<ResolvedRoutineItem>,
    today: LocalDate
): List<ToSortOutItem> {
    val items = mutableListOf<ToSortOutItem>()

    // 1. Transactions still needing a category — an import the user can't
    //    quickly clean up is an import they stop trusting.
    val uncategorised = txns.filter { !it.excluded && it.source == TxnSource.CSV && it.categoryId == CATEGORY_IDS.other }
    if (uncategorised.isNotEmpty()) {
        val n = uncategorised.size
        items.add(
            ToSortOutItem(
                id = "uncategorised",
                kind = ToSortOutKind.UNCATEGORISED,
                title = "$n transaction${if (n == 1) "" else "s"} need${if (n == 1) "s" else ""} a category",
                subtitle = "From an import — a quick pass keeps this trustworthy",
                to = "/transactions"
            )
        )
    }

    // 2. Detected price rises on recurring series (already filtered to
    //    non-muted, genuinely-risen series by `priceIncreases`).
    for (series in priceIncreases(recurring)) {
        items.add(
            ToSortOutItem(
                id = "price-rise-${series.id}",
                kind = ToSortOutKind.PRICE_RISE,
                title = "${series.merchant} went up",
                subtitle = "Detected price rise on a regular payment",
                amountCents = series.priceIncreaseCents,
                to = "/recurring"
            )
        )
    }

    // 3. unconfirmed-cycle: NOT PORTED — see the file doc comment.

    // 4. Monthly routine items due today or overdue. Skipped entirely on an
    //    empty vault — see the file doc comment for why this gate exists.
    val vaultHasData = txns.isNotEmpty() || recurring.isNotEmpty()
    if (vaultHasData) {
        for (item in resolvedRoutineItems) {
            if (item.done || item.dueDate.isAfter(today)) continue
            items.add(
                ToSortOutItem(
                    id = "routine-${item.id}",
                    kind = ToSortOutKind.ROUTINE,
                    title = item.label,
                    subtitle = if (item.overdue) "Overdue" else "Due today",
                    to = "/routine"
                )
            )
        }
    }

    return items
}
