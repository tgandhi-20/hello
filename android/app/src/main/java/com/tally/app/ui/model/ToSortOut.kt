package com.tally.app.ui.model

/**
 * UI-layer mirror of `src/features/today/toSortOut.ts`'s `ToSortOutItem` —
 * Home's fifth and only OPTIONAL section (DESIGN-V4.md §1/§3). An empty
 * list means this section renders nothing at all, not an empty state.
 */
data class UiToSortOutItem(
    val id: String,
    val title: String,
    val subtitle: String,
    /** Only set for kinds that carry a figure worth showing (a detected price rise). */
    val amountCents: Cents? = null,
)
