package com.tally.app.ui.model

import java.text.NumberFormat
import java.util.Locale

/**
 * Integer cents. Positive = money out (spend). Negative = money in
 * (income/refund) — mirrors `src/types.ts`'s `Cents` convention exactly so
 * a figure handed across from the money/vault layers means the same thing
 * here that it means there.
 *
 * CONSTRAINTS: "Money is a Long cents; format for display only, never
 * compute in the UI." Every function in this file only formats — none of
 * them add, subtract or derive a financial figure.
 */
typealias Cents = Long

private val AU_LOCALE: Locale = Locale.Builder().setLanguage("en").setRegion("AU").build()

private fun currencyFormatter(minFractionDigits: Int): NumberFormat =
    (NumberFormat.getCurrencyInstance(AU_LOCALE)).apply {
        currency = java.util.Currency.getInstance("AUD")
        minimumFractionDigits = minFractionDigits
        maximumFractionDigits = 2
    }

/**
 * Format integer cents as an en-AU currency string, e.g. `formatMoney(123456)`
 * -> `"$1,234.56"`. Negative cents render with a leading minus.
 *
 * @param showSign force a leading `+` on positive amounts (used for income rows).
 * @param hideCents omit the trailing `.00` on whole-dollar amounts.
 */
fun formatMoney(cents: Cents, showSign: Boolean = false, hideCents: Boolean = false): String {
    // -0 can arise from upstream arithmetic (a sign flip on a zero amount); never
    // let that render as "-$0.00".
    val safeCents = if (cents == 0L) 0L else cents
    val dollars = safeCents / 100.0
    val isWhole = safeCents % 100 == 0L
    val formatter = currencyFormatter(if (hideCents && isWhole) 0 else 2)
    var out = formatter.format(dollars)
    if (showSign && cents > 0) out = "+$out"
    return out
}

/**
 * The one canonical way the app displays a transaction amount: spend
 * (positive cents) as a plain figure, income (negative cents) as a
 * `+`-prefixed inflow — never a bare minus sign on a transaction row.
 */
fun formatTxnAmount(amountCents: Cents): String =
    if (amountCents < 0) formatMoney(-amountCents, showSign = true) else formatMoney(amountCents)
