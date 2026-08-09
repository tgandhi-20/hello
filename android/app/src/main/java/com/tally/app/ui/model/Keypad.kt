package com.tally.app.ui.model

/**
 * Pure amount-buffer logic for the quick-add keypad — a straight Kotlin port
 * of `src/features/log/Keypad.tsx`'s `applyKey`/`bufferToCents`/`centsToBuffer`.
 * This is keystroke bookkeeping (turning a sequence of taps into a digit
 * string, then that string into cents), not a money calculation — nothing
 * here reads bills, savings or history, so it doesn't fall under "never
 * compute money in the UI" any more than the web version's identical helper
 * does.
 */

private const val MAX_INT_DIGITS = 6
private const val MAX_DEC_DIGITS = 2

/** $999,999.99 — same ceiling as the web app's `MAX_AMOUNT_CENTS`. */
const val MAX_AMOUNT_CENTS: Cents = 99_999_999L

/** Append a keypress to an amount buffer, enforcing one decimal point and 2dp max. */
fun applyKeypadKey(buffer: String, key: String): String {
    if (key == "back") return if (buffer.isEmpty()) buffer else buffer.dropLast(1)
    if (key == ".") return if (buffer.contains(".")) buffer else "$buffer."

    val parts = buffer.split(".", limit = 2)
    val intPart = parts.getOrNull(0) ?: ""
    val decPart = parts.getOrNull(1)
    if (decPart != null) {
        if (decPart.length >= MAX_DEC_DIGITS) return buffer
        return buffer + key
    }
    if (intPart.length >= MAX_INT_DIGITS) return buffer
    return buffer + key
}

/** Convert a digit-string buffer straight to integer cents via string math — never a
 *  float parse (money is integer cents, never floats). */
fun keypadBufferToCents(buffer: String): Cents {
    if (buffer.isEmpty() || buffer == ".") return 0L
    val parts = buffer.split(".", limit = 2)
    val intPart = parts.getOrNull(0)?.ifEmpty { "0" } ?: "0"
    val decPartRaw = parts.getOrNull(1) ?: ""
    val decDigits = (decPartRaw + "00").take(2)
    val intCents = (intPart.toLongOrNull() ?: 0L) * 100
    val decCents = decDigits.toLongOrNull() ?: 0L
    return (intCents + decCents).coerceIn(0L, MAX_AMOUNT_CENTS)
}

/** Format cents back into an editable buffer, e.g. `550L` -> `"5.50"`. */
fun centsToKeypadBuffer(cents: Cents): String {
    val dollars = cents / 100
    val rem = kotlin.math.abs(cents % 100)
    return "$dollars.${rem.toString().padStart(2, '0')}"
}
