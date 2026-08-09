package com.tally.app.ui.model

/**
 * UI-layer mirror of `src/money/index.ts`'s `MonthMoneySavingsProgress` —
 * rendered as Home's ONE deposit-plan row (DESIGN-V4.md §1/§2), never a card.
 */
data class UiDepositPlan(
    val actualBalanceCents: Cents,
    val goalTargetCents: Cents,
    val onTrack: Boolean,
    /** Positive = behind plan. Only meaningful (and only shown) when !onTrack. */
    val behindCents: Cents,
    /** Whole days until the goal's target date. Can be negative if it's passed. */
    val daysLeft: Int,
)
