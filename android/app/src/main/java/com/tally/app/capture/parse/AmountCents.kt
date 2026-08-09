package com.tally.app.capture.parse

/**
 * Parses a plain numeral string (no currency symbol -- callers slice that off
 * via regex before reaching here) into exact integer cents as a `Long`.
 * **Never** `String.toDouble() * 100` -- that is exactly the float-rounding
 * trap this type exists to avoid (`"$1,234.56"` must become `123456`, exactly,
 * every time).
 */
object AmountCents {
    /**
     * `numeral` looks like `"1,234.56"`, `"45"`, `"5.5"` or `"0.99"`. Returns
     * `null` for anything that is not a clean, unambiguous number -- callers
     * treat `null` the same as "this notification did not parse" (dropped and
     * counted, never guessed).
     */
    fun parseNumeral(numeral: String): Long? {
        val cleaned = numeral.trim()
        if (cleaned.isEmpty()) return null

        val parts = cleaned.split(".")
        if (parts.size > 2) return null

        val wholeRaw = parts[0].replace(",", "")
        if (wholeRaw.isEmpty() || !wholeRaw.all(Char::isDigit)) return null
        val whole = wholeRaw.toLongOrNull() ?: return null

        val fraction = if (parts.size == 2) parts[1] else ""
        if (fraction.isNotEmpty() && (!fraction.all(Char::isDigit) || fraction.length > 2)) return null

        val fractionCents = when (fraction.length) {
            0 -> 0L
            1 -> fraction.toLong() * 10L
            else -> fraction.toLong()
        }

        return whole * 100L + fractionCents
    }
}
