package com.tally.app.ui.model

/**
 * UI-layer mirror of `src/money/index.ts`'s `MonthMoney` — the ONE money
 * model (DESIGN-V4.md §1). Every field here is something the equivalent web
 * `computeMonthMoney()` already returns; nothing on this screen derives a
 * new figure from raw transactions. See this package's `TallyDataSource`
 * doc comment for exactly how the orchestrator should wire the real
 * `com.tally.app.money` implementation in behind this shape.
 */
data class UiCategorySpend(
    val categoryId: String,
    val label: String,
    val colorIndex: Int,
    val spentCents: Cents,
)

data class UiMonthMoney(
    /** True when income is unset — the Income row must show a prompt, never
     *  an invented number (DESIGN-V4.md §1/§3). */
    val incomeUnset: Boolean,
    val incomeCents: Cents,
    val billsCents: Cents,
    val savingsCents: Cents,
    /** Income − Bills − Savings. Can be negative. */
    val toSpendCents: Cents,
    /** Discretionary spend already logged this month. */
    val spentCents: Cents,
    /** toSpendCents − spentCents. Can be negative. */
    val leftCents: Cents,
    /** Always >= 1 for the current month. */
    val daysRemaining: Int,
    /** leftCents ÷ daysRemaining, rounded to the nearest cent. */
    val leftTodayCents: Cents,
    /** The breakdown of spentCents, largest first — sums to spentCents exactly. */
    val byCategory: List<UiCategorySpend>,
)
