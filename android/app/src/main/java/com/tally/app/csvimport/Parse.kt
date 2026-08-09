package com.tally.app.csvimport

import com.tally.app.categorize.Rule
import com.tally.app.categorize.categorizeDescription
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import java.util.UUID

/**
 * Import orchestration: ties together CSV row-splitting, structural column
 * detection, bank format hinting, sign-convention resolution, categorisation
 * and dedupe hashing into the [ImportPreview] a UI would render. Ported from
 * src/import/parse.ts. Nothing here writes anywhere — [buildImportPreview]
 * only produces the preview; a caller decides when/whether to persist it.
 *
 * KOTLIN NOTE: the TS source processes rows in yielding batches
 * (`YIELD_EVERY` + `requestAnimationFrame`/`setTimeout`) so a large file
 * doesn't block the browser's UI thread. That concern doesn't exist for this
 * pure-JVM layer (there is no UI thread here at all — this module must stay
 * unit-testable without an emulator), so `onProgress`/yielding is left to
 * whichever Android UI-layer caller eventually drives this off the main
 * thread (e.g. via a coroutine dispatcher) — deliberately not modelled here.
 */

data class CsvAnalysis(
    val rawCsv: RawCsv,
    val layout: StructuralLayout,
    val formatDetection: FormatDetection,
    val signAnalysis: SignAnalysis,
    /** True when the structural read is confident enough to skip the manual mapper. */
    val isConfident: Boolean
)

private const val CONFIDENCE_THRESHOLD = 0.65

/** Parse raw CSV text and run structural detection, format hinting and sign analysis. */
fun analyzeCsv(text: String): CsvAnalysis {
    val rawCsv = parseRawCsv(text)
    val layout = detectStructure(rawCsv.rows)
    val formatDetection = detectBankFormat(layout)
    val signAnalysis = analyseSignConvention(layout, if (layout.confidence > 0) formatDetection.format else null)

    val isConfident = layout.confidence >= CONFIDENCE_THRESHOLD &&
        layout.dateCol != null &&
        (layout.amountCol != null || (layout.debitCol != null && layout.creditCol != null))

    return CsvAnalysis(rawCsv, layout, formatDetection, signAnalysis, isConfident)
}

data class ManualColumnMapping(
    val hasHeader: Boolean,
    val dateCol: Int,
    val descriptionCol: Int,
    val amountCol: Int? = null,
    val debitCol: Int? = null,
    val creditCol: Int? = null,
    val balanceCol: Int? = null
)

/** Build a [StructuralLayout] from a user-supplied manual mapping (the generic/low-confidence path). */
fun buildManualLayout(rawCsv: RawCsv, mapping: ManualColumnMapping): StructuralLayout {
    val dataRows = if (mapping.hasHeader) rawCsv.rows.drop(1) else rawCsv.rows
    val headerRow = if (mapping.hasHeader) rawCsv.rows.getOrNull(0) else null
    val colCount = maxOf(dataRows.maxOfOrNull { it.size } ?: 0, headerRow?.size ?: 0)

    val columns = (0 until colCount).map { index ->
        val role = when (index) {
            mapping.dateCol -> ColumnRole.DATE
            mapping.descriptionCol -> ColumnRole.DESCRIPTION
            mapping.amountCol -> ColumnRole.AMOUNT
            mapping.debitCol -> ColumnRole.DEBIT
            mapping.creditCol -> ColumnRole.CREDIT
            mapping.balanceCol -> ColumnRole.BALANCE
            else -> ColumnRole.UNKNOWN
        }
        ColumnProfile(index, role, 1.0)
    }

    return StructuralLayout(
        hasHeader = mapping.hasHeader,
        headerRow = headerRow,
        dataRows = dataRows,
        columns = columns,
        dateCol = mapping.dateCol,
        descriptionCol = mapping.descriptionCol,
        amountCol = mapping.amountCol,
        debitCol = mapping.debitCol,
        creditCol = mapping.creditCol,
        balanceCol = mapping.balanceCol,
        confidence = 1.0, // user-specified — treated as fully confident
        warnings = emptyList()
    )
}

data class BuildPreviewOptions(
    val account: AccountId,
    val detectedFormat: BankFormat,
    val signInverted: Boolean,
    val rules: List<Rule>,
    val categories: List<Category>,
    /** Hashes already present in the store, so the preview's duplicate count is accurate before commit. */
    val existingHashes: Set<String>
)

/** Result of parsing one CSV file, shown on a preview-and-confirm screen. */
data class ImportPreview(
    val detectedFormat: BankFormat,
    val account: AccountId,
    val rows: List<Txn>,
    val duplicateCount: Int,
    /** Parse problems worth surfacing before the user commits. */
    val warnings: List<String>,
    /** True when positive values in the file mean "spend" (Amex convention). */
    val signInverted: Boolean
)

/**
 * Build the full [ImportPreview] from a resolved structural layout: parses
 * every row, applies the sign convention, categorises, hashes for dedupe, and
 * excludes duplicates from `rows` (their count surfaces via `duplicateCount`
 * — "Report 'N new, M duplicates skipped'").
 */
fun buildImportPreview(layout: StructuralLayout, options: BuildPreviewOptions): ImportPreview {
    val warnings = layout.warnings.toMutableList()
    val rows = mutableListOf<Txn>()
    // Per (date, amount, description, account) occurrence counter — see Dedupe.kt's
    // doc comment. This is what lets two genuinely distinct same-day identical rows
    // (two coffees) hash differently instead of one silently vanishing as a false
    // "duplicate" of the other.
    val occurrenceCounts = HashMap<String, Int>()
    var duplicateCount = 0
    var invalidCount = 0

    val total = layout.dataRows.size

    if (layout.dateCol == null || layout.descriptionCol == null) {
        warnings.add("Could not identify required columns — use the manual mapper to select date, description and amount columns.")
        return ImportPreview(options.detectedFormat, options.account, emptyList(), 0, warnings, options.signInverted)
    }

    for (row in layout.dataRows) {
        val dateStr = tryParseDate(row.getOrElse(layout.dateCol) { "" })
        val rawSigned = rawSignedCentsForRow(layout, row)
        val rawDescription = row.getOrElse(layout.descriptionCol) { "" }

        if (dateStr == null || rawSigned == null) {
            invalidCount++
            continue
        }

        val amountCents = applySignConvention(rawSigned, options.signInverted)
        val categorized = categorizeDescription(rawDescription, options.rules, options.categories)

        val groupKey = dedupeGroupKey(DedupeFields(dateStr, amountCents, rawDescription, options.account))
        val occurrence = occurrenceCounts.getOrDefault(groupKey, 0)
        occurrenceCounts[groupKey] = occurrence + 1
        val hash = hashTxn(dateStr, amountCents, rawDescription, options.account, occurrence)

        if (options.existingHashes.contains(hash)) {
            duplicateCount++
        } else {
            val now = System.currentTimeMillis()
            rows.add(
                Txn(
                    id = UUID.randomUUID().toString(),
                    date = dateStr,
                    amountCents = amountCents,
                    description = rawDescription,
                    merchant = categorized.merchant,
                    categoryId = categorized.categoryId,
                    account = options.account,
                    source = TxnSource.CSV,
                    hash = hash,
                    createdAt = now,
                    updatedAt = now
                )
            )
        }
    }

    if (invalidCount > 0) {
        warnings.add("$invalidCount row${if (invalidCount == 1) "" else "s"} could not be parsed and ${if (invalidCount == 1) "was" else "were"} skipped.")
    }
    if (rows.isEmpty() && duplicateCount == 0 && invalidCount == 0 && total == 0) {
        warnings.add("The file has no data rows.")
    }

    return ImportPreview(options.detectedFormat, options.account, rows, duplicateCount, warnings, options.signInverted)
}
