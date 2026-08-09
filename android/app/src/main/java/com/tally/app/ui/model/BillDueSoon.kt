package com.tally.app.ui.model

import java.time.LocalDate

/**
 * UI-layer mirror of `src/features/today/billsDueSoon.ts`'s `BillDueSoonItem`
 * — "Bills due soon", the next 14 days, merged from recurring charges, card
 * due dates, statement closes, salary and the savings transfer into one list.
 */
data class UiBillDueSoon(
    val id: String,
    val date: LocalDate,
    val label: String,
    /** Signed like a transaction (positive = cash out). Null when there's
     *  genuinely nothing to show (a statement-close marker is a date, not
     *  an amount). */
    val amountCents: Cents?,
    /** True = Tally is still projecting this from a detected cadence and it
     *  could shift a little ("We think — not confirmed yet"). */
    val predicted: Boolean,
)
