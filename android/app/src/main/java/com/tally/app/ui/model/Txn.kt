package com.tally.app.ui.model

import java.time.LocalDate

/**
 * UI-layer view of `src/types.ts`'s `Txn`. `java.time.LocalDate` is used
 * (not a raw string) — it's natively available from API 26, exactly this
 * app's `minSdk`, no desugaring library required.
 */
data class UiTxn(
    val id: String,
    val date: LocalDate,
    /** Positive = spend, negative = income. Integer cents. */
    val amountCents: Cents,
    val merchant: String,
    val categoryId: String,
    val note: String? = null,
)

/** One day's worth of transactions plus its subtotal — what the transactions
 *  list actually renders, grouped and pre-summed by the data layer, never
 *  recomputed ad hoc inside a composable. */
data class UiDayGroup(
    val date: LocalDate,
    val txns: List<UiTxn>,
    val subtotalCents: Cents,
)
