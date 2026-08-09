package com.tally.app.categorize

import com.tally.app.money.Category

/**
 * Categorisation engine. Ported from src/categorize/categorize.ts. Priority
 * order:
 *   1. User [Rule]s — the app learns from corrections, so these always win.
 *   2. Branded merchant dictionary.
 *   3. Generic (non-branded) keyword patterns.
 *   4. Fallback to "Other"/"Uncategorised" (or the first available category).
 *
 * Category *labels* from the dictionary are resolved against whatever
 * `Category` list the caller actually holds at runtime — ids are never
 * hardcoded here.
 */

/** A user-taught categorisation rule. Created when the user corrects a category. */
data class Rule(val id: String, val match: String, val categoryId: String, val createdAt: Long)

enum class CategorizeMatchSource { RULE, DICTIONARY, GENERIC, UNMATCHED }

data class CategorizeResult(
    /** Cleaned merchant name to store/display (dictionary canonical name when matched). */
    val merchant: String,
    val categoryId: String,
    val matchedBy: CategorizeMatchSource
)

private fun resolveCategoryId(labels: List<String>, categories: List<Category>): String {
    for (label in labels) {
        val found = categories.find { it.label.equals(label, ignoreCase = true) }
        if (found != null) return found.id
    }
    val fallback = categories.find { Regex("other|uncategor", RegexOption.IGNORE_CASE).containsMatchIn(it.label) }
    if (fallback != null) return fallback.id
    return categories.firstOrNull()?.id ?: ""
}

private fun matchEntry(paddedKey: String, entries: List<DictionaryEntry>): DictionaryEntry? {
    for (entry in entries) {
        if (entry.patterns.any { paddedKey.contains(it) }) return entry
    }
    return null
}

/**
 * Categorise a raw transaction description: cleans the merchant, applies the
 * user's learned rules first, then the AU merchant dictionary, then generic
 * keyword patterns, and finally falls back to an "Other"/"Uncategorised"
 * category.
 */
fun categorizeDescription(rawDescription: String, rules: List<Rule>, categories: List<Category>): CategorizeResult {
    val merchant = cleanMerchant(rawDescription)
    // Pad so single-word merchants (e.g. exactly "BP") still match space-delimited
    // patterns (e.g. " bp ") intended to avoid false positives like "Bpay".
    val paddedKey = " ${merchant.lowercase()} "

    // 1. User rules — longest match wins when more than one substring matches.
    val ruleMatches = rules.filter { paddedKey.contains(it.match.lowercase()) }
    if (ruleMatches.isNotEmpty()) {
        val best = ruleMatches.reduce { a, b -> if (b.match.length > a.match.length) b else a }
        return CategorizeResult(merchant, best.categoryId, CategorizeMatchSource.RULE)
    }

    // 2. Branded dictionary.
    val branded = matchEntry(paddedKey, MERCHANT_DICTIONARY)
    if (branded != null) {
        return CategorizeResult(
            merchant = branded.canonicalName.ifEmpty { merchant },
            categoryId = resolveCategoryId(branded.categoryLabels, categories),
            matchedBy = CategorizeMatchSource.DICTIONARY
        )
    }

    // 3. Generic patterns.
    val generic = matchEntry(paddedKey, GENERIC_PATTERNS)
    if (generic != null) {
        return CategorizeResult(merchant, resolveCategoryId(generic.categoryLabels, categories), CategorizeMatchSource.GENERIC)
    }

    // 4. Unguessable (e.g. a local café) — default sensibly, leave it one tap from correct.
    return CategorizeResult(merchant, resolveCategoryId(emptyList(), categories), CategorizeMatchSource.UNMATCHED)
}
