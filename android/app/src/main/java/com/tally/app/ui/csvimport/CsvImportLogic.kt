package com.tally.app.ui.csvimport

import com.tally.app.categorize.Rule
import com.tally.app.csvimport.BankFormat
import com.tally.app.csvimport.BuildPreviewOptions
import com.tally.app.csvimport.CsvAnalysis
import com.tally.app.csvimport.ImportPreview
import com.tally.app.csvimport.SignMethod
import com.tally.app.csvimport.buildImportPreview
import com.tally.app.money.AccountId
import com.tally.app.money.Category

/**
 * Pure (non-Compose, non-Android) logic for the CSV import screen — split out
 * from CsvImportScreen.kt so every rule here is directly JUnit-testable on
 * the host JVM, the same way com.tally.app.csvimport itself is. Nothing here
 * writes anywhere; the actual commit is VaultRepository.addTxns, called only
 * from the screen after an explicit user confirmation.
 */

// ---------------------------------------------------------------------------
// Screen state — a plain sealed class so the screen's transitions are testable
// without a Compose/Android test harness.
// ---------------------------------------------------------------------------

sealed class CsvImportUiState {
    /** Nothing picked yet. */
    data object PickFile : CsvImportUiState()

    /** Reading the file / hydrating the ledger / building the preview. */
    data object Loading : CsvImportUiState()

    /** A calm, specific explanation of why nothing can be imported from this file. */
    data class Failure(val message: String) : CsvImportUiState()

    /** Detected (or user-adjusted) layout, ready for the user to confirm or back out of. */
    data class Review(
        val analysis: CsvAnalysis,
        val account: AccountId,
        val signInverted: Boolean,
        /** True once the user has manually overridden the detected sign convention. */
        val signOverridden: Boolean,
        val preview: ImportPreview,
        val categories: List<Category>,
        val rules: List<Rule>,
        /** Hashes of every transaction already in the ledger, captured once per file
         *  pick so the preview and the eventual commit dedupe against the same set. */
        val existingHashes: Set<String>,
    ) : CsvImportUiState()

    /** Writing to the vault via VaultRepository.addTxns. */
    data object Committing : CsvImportUiState()

    data class Committed(val added: Int, val skipped: Int) : CsvImportUiState()
}

// ---------------------------------------------------------------------------
// File-content sanity checks — run before anything is handed to the parser.
// ---------------------------------------------------------------------------

private const val BINARY_SAMPLE_SIZE = 8_000
private const val BINARY_CONTROL_RATIO_THRESHOLD = 0.05

/**
 * True when [bytes] looks like a binary file rather than text/CSV: a NUL
 * byte anywhere in the sampled prefix, or a high proportion of non-printable
 * control characters in it. Bytes >= 0x80 (UTF-8 multi-byte sequences) are
 * never counted as suspicious — plenty of real bank exports use non-ASCII
 * merchant names.
 */
fun looksBinary(bytes: ByteArray): Boolean {
    if (bytes.isEmpty()) return false
    val sampleSize = minOf(bytes.size, BINARY_SAMPLE_SIZE)
    var suspicious = 0
    for (i in 0 until sampleSize) {
        val b = bytes[i].toInt() and 0xFF
        if (b == 0) return true
        val isTextLike = b in 0x20..0x7E || b == 0x09 || b == 0x0A || b == 0x0D || b >= 0x80
        if (!isTextLike) suspicious++
    }
    return suspicious.toDouble() / sampleSize > BINARY_CONTROL_RATIO_THRESHOLD
}

// ---------------------------------------------------------------------------
// Plain-words descriptions of what the parser decided — the point of the
// whole screen: confidence vs. a guess, said out loud.
// ---------------------------------------------------------------------------

/** Short display name for an account — never a raw enum id on screen. */
fun accountDisplayName(account: AccountId): String = when (account) {
    AccountId.CBA -> "CBA"
    AccountId.CBA_CARD -> "CBA card"
    AccountId.BANKWEST -> "Bankwest"
    AccountId.AMEX -> "Amex"
    AccountId.CASH -> "Cash"
}

/** Plain-words display name for a detected bank format. */
fun bankFormatDisplayName(format: BankFormat): String = when (format) {
    BankFormat.CBA -> "CBA"
    BankFormat.BANKWEST -> "Bankwest"
    BankFormat.AMEX -> "Amex"
    BankFormat.GENERIC -> "an unrecognised bank"
}

/**
 * Plain-words explanation of how the spend/income sign convention was
 * resolved. [SignMethod.BALANCE_VERIFIED] is the strong case — the running
 * balance in the file confirmed it — and says so explicitly, because that is
 * the difference between confidence and a guess.
 */
fun describeSignResolution(method: SignMethod, signInverted: Boolean, overridden: Boolean): String {
    val convention = if (signInverted) {
        "Positive amounts in the file are spending, negative are income."
    } else {
        "Negative amounts in the file are spending, positive are income."
    }
    val basis = if (overridden) {
        "You set this manually."
    } else {
        when (method) {
            SignMethod.BALANCE_VERIFIED -> "Confirmed from the running balance column."
            SignMethod.HEURISTIC_MAJORITY -> "Inferred from the mix of amounts in the file — not verified against a balance column."
            SignMethod.FORMAT_HINT -> "Low confidence — based only on which bank this file looks like."
            SignMethod.USER_OVERRIDE -> "You set this manually."
        }
    }
    return "$basis $convention"
}

/** Describes which physical column a structural role resolved to, in plain words. */
fun describeColumn(headerRow: List<String>?, index: Int?): String {
    if (index == null) return "not found"
    val header = headerRow?.getOrNull(index)?.takeIf { it.isNotBlank() }
    return if (header != null) "\"$header\" (column ${index + 1})" else "column ${index + 1}"
}

/** All five accounts a CSV row can be attributed to, in the order the picker shows them. */
val IMPORT_ACCOUNTS: List<AccountId> = listOf(AccountId.CBA, AccountId.CBA_CARD, AccountId.BANKWEST, AccountId.AMEX, AccountId.CASH)

// ---------------------------------------------------------------------------
// Preview building / failure classification.
// ---------------------------------------------------------------------------

/**
 * If [preview] has nothing usable and a warning explains why, returns that
 * calm, specific message. Returns null when there IS something to review —
 * including the legitimate case where every row turned out to already be in
 * the ledger (0 new, N duplicates is a result, not a failure).
 */
fun previewFailureMessage(preview: ImportPreview, totalDataRows: Int): String? {
    if (totalDataRows == 0) {
        return "This file has no data rows to import."
    }
    if (preview.rows.isEmpty() && preview.duplicateCount == 0) {
        return preview.warnings.firstOrNull()
            ?: "Couldn't find any rows in this file that look like transactions."
    }
    return null
}

/**
 * Build the preview for a given (account, sign) choice — called on first
 * analysis and again whenever the user changes the account or overrides the
 * sign convention on the review screen. Nothing is written here; see
 * VaultRepository.addTxns for the actual commit.
 */
fun buildPreviewFor(
    analysis: CsvAnalysis,
    account: AccountId,
    signInverted: Boolean,
    rules: List<Rule>,
    categories: List<Category>,
    existingHashes: Set<String>,
): ImportPreview = buildImportPreview(
    analysis.layout,
    BuildPreviewOptions(
        account = account,
        detectedFormat = analysis.formatDetection.format,
        signInverted = signInverted,
        rules = rules,
        categories = categories,
        existingHashes = existingHashes,
    ),
)

/**
 * Re-derive the review state for a new account or sign choice, reusing the
 * same [CsvImportUiState.Review.analysis] and [CsvImportUiState.Review.existingHashes]
 * captured when the file was first read. Falls back to [CsvImportUiState.Failure]
 * in the (rare) case a manual sign override somehow leaves nothing to import —
 * never a silent no-op.
 */
fun recomputeReview(
    current: CsvImportUiState.Review,
    account: AccountId,
    signInverted: Boolean,
    signOverridden: Boolean,
): CsvImportUiState {
    val preview = buildPreviewFor(current.analysis, account, signInverted, current.rules, current.categories, current.existingHashes)
    val failureMessage = previewFailureMessage(preview, current.analysis.layout.dataRows.size)
    if (failureMessage != null) {
        return CsvImportUiState.Failure(failureMessage)
    }
    return current.copy(account = account, signInverted = signInverted, signOverridden = signOverridden, preview = preview)
}
