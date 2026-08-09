package com.tally.app.csvimport

import com.tally.app.money.Cents

/**
 * Exact string-based money parsing. Ported from src/import/money.ts.
 *
 * Integer cents. Never a float. `"123.45".toDouble() * 100` introduces
 * rounding error — every amount here is parsed as a string and converted to
 * integer cents with integer arithmetic only.
 */

/**
 * Parse a monetary string into integer cents, preserving whatever sign was
 * written in the source file (i.e. this does NOT apply the app's
 * spend-positive convention — see [Sign.kt] for that). Returns `null` if the
 * string isn't recognisably money.
 *
 * Handles: `$1,234.56`, `1234.56`, `-$5`, `$-5.00`, `(45.00)` (accounting
 * negative), `45.00-` (trailing minus), thousands separators, missing
 * decimals, and stray whitespace/currency codes (`AUD`, `AU$`).
 */
fun parseMoneyToCents(raw: String?): Cents? {
    if (raw == null) return null
    var s = raw.trim()
    if (s.isEmpty()) return null

    var negative = false

    // Accounting-style parentheses negative: "(45.00)"
    val parenMatch = Regex("^\\((.*)\\)$").find(s)
    if (parenMatch != null) {
        negative = true
        s = parenMatch.groupValues[1].trim()
    }

    // Trailing minus: "45.00-"
    if (s.endsWith("-")) {
        negative = true
        s = s.substring(0, s.length - 1).trim()
    }

    // Leading minus (possibly before or after a currency symbol): "-$5.00" / "$-5.00" / "-5"
    if (s.startsWith("-")) {
        negative = true
        s = s.substring(1).trim()
    }
    // Also strip a "+" some exports use for credits.
    if (s.startsWith("+")) {
        s = s.substring(1).trim()
    }

    // Strip only known currency markers ($ sign, AUD/AU$ codes) — NOT letters generally.
    // A bare alphanumeric string (e.g. a reference code like "REF00981239") must never be
    // mistaken for money, so any other letters left after this fall through to rejection.
    s = s.replace("$", "")
        .replace(Regex("\\bAUD\\b", RegexOption.IGNORE_CASE), "")
        .replace(Regex("\\bAU\\b", RegexOption.IGNORE_CASE), "")
        .trim()

    // A minus could still be hiding after the currency symbol was stripped, e.g. "$ -5.00"
    if (s.startsWith("-")) {
        negative = true
        s = s.substring(1).trim()
    }

    if (s.isEmpty()) return null
    if (Regex("[A-Za-z]").containsMatchIn(s)) return null // any remaining letters -> not a monetary string

    // Now expect something like "1,234.56" or "1234.56" or "1234" or ".56"
    if (!Regex("^[\\d.,\\s]+$").matches(s)) return null

    s = s.replace(Regex("\\s"), "")

    // Thousands separator is ',' in en-AU; strip it entirely.
    s = s.replace(",", "")

    if (s.isEmpty() || s == ".") return null
    val dotCount = s.count { it == '.' }
    if (!Regex("^\\d*\\.?\\d*$").matches(s) || dotCount > 1) return null

    val dotIndex = s.indexOf('.')
    val wholeRaw: String
    val fracRaw: String
    if (dotIndex == -1) {
        wholeRaw = s
        fracRaw = ""
    } else {
        wholeRaw = s.substring(0, dotIndex)
        fracRaw = s.substring(dotIndex + 1)
    }
    val whole = wholeRaw.ifEmpty { "0" }
    // More than 2 decimal places isn't a currency amount we can trust structurally
    // (could still be valid — truncate rather than reject, banks don't do sub-cent).
    val frac = (fracRaw + "00").substring(0, 2)

    if (!Regex("^\\d+$").matches(whole) || !Regex("^\\d+$").matches(frac)) return null

    val cents = whole.toLong() * 100 + frac.toLong()

    return if (negative) -cents else cents
}

/** True if the string looks like a monetary amount at all (used for column sniffing). */
fun looksLikeMoney(raw: String?): Boolean {
    if (raw == null) return false
    val s = raw.trim()
    if (s.isEmpty()) return false
    return parseMoneyToCents(s) != null
}
