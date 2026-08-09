package com.tally.app.categorize

/**
 * Merchant string normalisation. Ported from src/categorize/normalize.ts.
 * Bank CSV descriptions are full of noise — card suffixes, reference numbers,
 * payment-processor prefixes, location codes, embedded dates. This is what
 * the categoriser matches against, and what the user sees in the transaction
 * list.
 */

private val AU_STATE_CODES = listOf("NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT")

// Payment-rail/POS prefixes and suffixes that carry no merchant information.
// Each pattern is `^`-anchored, so there is at most one possible match per
// pattern regardless of "replace first" vs "replace all" semantics.
private val NOISE_PREFIXES = listOf(
    Regex("^EFTPOS\\s+PURCHASE\\s*", RegexOption.IGNORE_CASE),
    Regex("^EFTPOS\\s+DEBIT\\s*", RegexOption.IGNORE_CASE),
    Regex("^EFTPOS\\s*", RegexOption.IGNORE_CASE),
    Regex("^VISA\\s+DEBIT\\s+PURCHASE\\s*", RegexOption.IGNORE_CASE),
    Regex("^VISA\\s+PURCHASE\\s*", RegexOption.IGNORE_CASE),
    Regex("^VISA\\s*", RegexOption.IGNORE_CASE),
    Regex("^MASTERCARD\\s+PURCHASE\\s*", RegexOption.IGNORE_CASE),
    Regex("^CARD\\s+PURCHASE\\s*", RegexOption.IGNORE_CASE),
    Regex("^POS\\s+PURCHASE\\s*", RegexOption.IGNORE_CASE),
    Regex("^POS\\s*", RegexOption.IGNORE_CASE),
    Regex("^PURCHASE[\\s-]+EFTPOS\\s*", RegexOption.IGNORE_CASE),
    Regex("^DIRECT\\s+DEBIT\\s*", RegexOption.IGNORE_CASE),
    Regex("^AUTOMATIC\\s+PAYMENT\\s*", RegexOption.IGNORE_CASE),
    Regex("^RECURRING\\s+PAYMENT\\s*", RegexOption.IGNORE_CASE),
    Regex("^INTERNET\\s+PAYMENT\\s+TO\\s*", RegexOption.IGNORE_CASE),
    Regex("^PAYMENT\\s+TO\\s*", RegexOption.IGNORE_CASE),
    Regex("^BPAY\\s+PAYMENT\\s*", RegexOption.IGNORE_CASE)
)

// Payment-processor markers embedded mid-string, e.g. "SQ *THE COFFEE CLUB".
private val PROCESSOR_MARKERS = listOf(
    Regex("^SQ\\s*\\*\\s*", RegexOption.IGNORE_CASE),
    Regex("^SP\\s*\\*\\s*", RegexOption.IGNORE_CASE),
    Regex("^PAYPAL\\s*\\*\\s*", RegexOption.IGNORE_CASE),
    Regex("^PP\\s*\\*\\s*", RegexOption.IGNORE_CASE)
)

/** Reference/card-suffix tokens: long digit runs, masked card numbers, trailing ref codes. */
private fun stripReferenceNumbers(input: String): String {
    var s = input
    s = s.replace(Regex("\\bCARD\\s*(?:ENDING|NO\\.?|NUMBER)?\\s*[Xx*]{2,}\\d{2,6}\\b", RegexOption.IGNORE_CASE), "")
    s = s.replace(Regex("\\b[Xx*]{2,}\\d{2,6}\\b"), "")
    s = s.replace(Regex("\\b\\d{4}[\\s-]?[Xx*]{2,}[\\s-]?\\d{2,4}\\b"), "") // masked PAN e.g. 4514-XXXX-1234
    s = s.replace(Regex("\\bAUTH(?:ORISATION)?\\s*(?:CODE)?[:#]?\\s*\\d{4,}\\b", RegexOption.IGNORE_CASE), "")
    s = s.replace(Regex("\\bREF(?:ERENCE)?[:#]?\\s*[A-Z0-9]{5,}\\b", RegexOption.IGNORE_CASE), "")
    s = s.replace(Regex("\\b(?:RRN|TXN|TRANS(?:ACTION)?)[:#]?\\s*[A-Z0-9]{5,}\\b", RegexOption.IGNORE_CASE), "")
    s = s.replace(Regex("\\bNMI\\s*[A-Z0-9]{5,}\\b", RegexOption.IGNORE_CASE), "") // Bankwest merchant terminal ids
    s = s.replace(Regex("\\b\\d{6,}\\b"), "") // any other bare 6+ digit reference run
    return s
}

/** Embedded dates like "07AUG" "07/08" "AUG26" "07-08-2026" "31 JAN". */
private fun stripEmbeddedDates(input: String): String {
    var s = input
    s = s.replace(Regex("\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b"), "")
    s = s.replace(Regex("\\b\\d{1,2}\\s?(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\\s?\\d{2,4})?\\b", RegexOption.IGNORE_CASE), "")
    s = s.replace(Regex("\\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s?\\d{2,4}\\b", RegexOption.IGNORE_CASE), "")
    return s
}

private fun stripTrailingLocation(input: String): String {
    var out = input
    out = out.replace(Regex("\\b(?:AUSTRALIA|AUS|AU)\\s*$", RegexOption.IGNORE_CASE), "").trim()
    val stateRe = Regex("\\b(?:${AU_STATE_CODES.joinToString("|")})\\s*\\d{0,4}\\s*$", RegexOption.IGNORE_CASE)
    out = out.replace(stateRe, "").trim()
    return out.trim()
}

private val KEEP_UPPER = setOf("BWS", "KFC", "IGA", "JB", "TPG", "AGL", "BP", "ATM")

/** Collapse to Title Case for display, without mangling known-good acronyms. */
private fun toDisplayCase(input: String): String {
    return input.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ") { word ->
        val bare = word.replace(Regex("[^A-Za-z']"), "")
        when {
            KEEP_UPPER.contains(bare.uppercase()) -> word.uppercase()
            word.length <= 1 -> word.uppercase()
            else -> word[0].uppercaseChar() + word.substring(1).lowercase()
        }
    }
}

/**
 * Clean a raw bank description down to a merchant name suitable for matching
 * and display. Deterministic and reused for both categorisation and the
 * dedupe hash's normalised description component.
 */
fun cleanMerchant(rawDescription: String): String {
    var s = rawDescription.trim()
    if (s.isEmpty()) return ""

    for (re in NOISE_PREFIXES) s = s.replace(re, "")
    for (re in PROCESSOR_MARKERS) s = s.replace(re, "")

    s = stripReferenceNumbers(s)
    s = stripEmbeddedDates(s)
    s = stripTrailingLocation(s)

    s = s
        .replace(Regex("[_#*]+"), " ")
        .replace(Regex("\\s{2,}"), " ")
        .replace(Regex("^[\\s\\-,.:]+|[\\s\\-,.:]+$"), "")
        .trim()

    if (s.isEmpty()) return rawDescription.trim()

    return toDisplayCase(s)
}

/**
 * Fold a description down to a stable key for the dedupe hash and rule
 * matching: lowercase, whitespace-collapsed, punctuation-light.
 */
fun normaliseForMatch(s: String): String = cleanMerchant(s).lowercase().trim()
