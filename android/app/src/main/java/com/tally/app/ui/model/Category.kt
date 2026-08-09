package com.tally.app.ui.model

/** Mirrors `src/types.ts`'s `CategoryKind`. */
enum class CategoryKind { NEED, WANT, SAVE }

/**
 * UI-layer view of `src/types.ts`'s `Category`. `colorIndex` stands in for
 * the web's `colorToken` string (`'cat-3'`) — an index into
 * `TallyColors.CategoryRamp`, resolved only inside the theme layer so no
 * screen ever holds a raw hex.
 */
data class UiCategory(
    val id: String,
    val label: String,
    val colorIndex: Int,
    val kind: CategoryKind,
    /** True for the app's built-in categories; user-defined ones can be deleted. */
    val builtin: Boolean = true,
    /**
     * The category's typical spend, in cents — pre-filled into the quick-add
     * amount so most log entries need zero digits typed. Supplied by the
     * money/vault layer (`suggestedAmountCents` on the web); `null` when
     * there's no history yet, in which case quick-add starts blank rather
     * than guessing.
     */
    val typicalAmountCents: Cents? = null,
)
