package com.tally.app.csvimport

import com.tally.app.money.AccountId

/**
 * Best-effort bank format identification. Ported from src/import/detect.ts.
 * This is a HINT ONLY, used to preselect the account and bias the
 * sign-convention default — it must never be trusted on its own.
 */
enum class BankFormat(val id: String) { CBA("cba"), BANKWEST("bankwest"), AMEX("amex"), GENERIC("generic") }

data class FormatDetection(
    val format: BankFormat,
    /** 0-1. Below ~0.5 the caller should treat this as a weak hint only. */
    val confidence: Double,
    val accountGuess: AccountId,
    val reasons: List<String>
)

private fun headerIncludes(tokens: List<String>, needle: String): Boolean = tokens.any { it.contains(needle) }

/**
 * Guess which bank produced this file from header text (if present) and the
 * structural shape already detected in Columns.kt. Never authoritative.
 */
fun detectBankFormat(layout: StructuralLayout): FormatDetection {
    val headerTokens = (layout.headerRow ?: emptyList()).map { it.lowercase().trim() }
    val colCount = layout.columns.size
    val hasDebitCredit = layout.debitCol != null && layout.creditCol != null
    val hasBalance = layout.balanceCol != null

    var cba = 0.0
    var bankwest = 0.0
    var amex = 0.0
    val reasons = mutableListOf<String>()

    // --- CBA: typically headerless Date,Amount,Description,Balance ---
    if (!layout.hasHeader && colCount <= 4 && layout.dateCol == 0) {
        cba += 0.4
        reasons.add("Headerless with date in column 1 (CBA-style).")
    }
    if (!layout.hasHeader && hasBalance) {
        cba += 0.2
    }
    // CBA also appears headered as Date,Description,Debit,Credit,Balance
    if (layout.hasHeader && hasDebitCredit && hasBalance && colCount <= 5 && !headerIncludes(headerTokens, "bsb")) {
        cba += 0.35
        reasons.add("Headered Date/Description/Debit/Credit/Balance without a BSB column (CBA-style).")
    }

    // --- Bankwest: BSB Number, Account Number, Transaction Date, Narration, Cheque, Debit, Credit, Balance, Transaction Type ---
    if (headerIncludes(headerTokens, "bsb")) {
        bankwest += 0.5
        reasons.add("Header contains \"BSB\".")
    }
    if (headerIncludes(headerTokens, "narration")) {
        bankwest += 0.25
        reasons.add("Header contains \"Narration\".")
    }
    if (hasDebitCredit && hasBalance && colCount >= 8) {
        bankwest += 0.2
    }

    // --- Amex: Date, Description, Card Member, Account #, Amount ---
    if (headerIncludes(headerTokens, "card member")) {
        amex += 0.45
        reasons.add("Header contains \"Card Member\".")
    }
    if ((headerIncludes(headerTokens, "account #") || headerIncludes(headerTokens, "account#")) && !headerIncludes(headerTokens, "bsb")) {
        amex += 0.2
        reasons.add("Header contains \"Account #\" without a BSB column.")
    }
    if (layout.amountCol != null && !hasBalance && !hasDebitCredit && (colCount == 5 || colCount == 4)) {
        amex += 0.2
    }

    val scored = listOf(BankFormat.CBA to cba, BankFormat.BANKWEST to bankwest, BankFormat.AMEX to amex)
        .sortedByDescending { it.second }
    val (topFormat, topScore) = scored[0]

    if (topScore < 0.45) {
        return FormatDetection(
            format = BankFormat.GENERIC,
            confidence = maxOf(0.0, topScore),
            accountGuess = AccountId.CBA,
            reasons = reasons.ifEmpty { listOf("No confident structural or header match to a known bank.") }
        )
    }

    val accountGuess = when (topFormat) {
        BankFormat.CBA -> AccountId.CBA
        BankFormat.BANKWEST -> AccountId.BANKWEST
        BankFormat.AMEX -> AccountId.AMEX
        BankFormat.GENERIC -> AccountId.CBA
    }
    return FormatDetection(topFormat, minOf(1.0, topScore), accountGuess, reasons)
}
