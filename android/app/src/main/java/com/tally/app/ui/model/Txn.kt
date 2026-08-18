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
    /**
     * Raw transaction text as it appeared before merchant cleanup
     * (`money.Txn.description`) — kept separate from [merchant] so search
     * can still find wording `cleanMerchant` stripped out. `null` only for a
     * [UiTxn] that has no real vault-backed record behind it yet (a search
     * predicate must fall back to [merchant] alone, never crash on a missing
     * value); `VaultTallyDataSource.toUiTxn` (`ui/data`) populates the real
     * value for every transaction the running app actually shows.
     */
    val description: String? = null,
    /**
     * The account this transaction belongs to, as a plain id
     * (`money.AccountId.id`, e.g. `"amex"`) — mirrors [categoryId] rather
     * than importing `money.AccountId` into this seam-facing package, same
     * as every other Ui* shape in this file. `null` means "unknown", which
     * a per-account filter must treat as "does not match any specific
     * account" — never as a silent match for every account.
     * `VaultTallyDataSource.toUiTxn` populates the real value for every
     * transaction the running app actually shows.
     */
    val account: String? = null,
    /**
     * Mirrors `money.Txn.excluded` — excluded from budgets/insights (e.g. a
     * reimbursed expense, an internal transfer). `VaultTallyDataSource.toUiTxn`
     * populates the real value for every transaction the running app
     * actually shows; the `false` default here only stands in before a real
     * record has been mapped.
     */
    val excluded: Boolean = false,
)

/** One day's worth of transactions plus its subtotal — what the transactions
 *  list actually renders, grouped and pre-summed by the data layer, never
 *  recomputed ad hoc inside a composable. */
data class UiDayGroup(
    val date: LocalDate,
    val txns: List<UiTxn>,
    val subtotalCents: Cents,
)
