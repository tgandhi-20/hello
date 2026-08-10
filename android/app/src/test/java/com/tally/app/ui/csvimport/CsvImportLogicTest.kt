package com.tally.app.ui.csvimport

import com.tally.app.csvimport.BankFormat
import com.tally.app.csvimport.ImportPreview
import com.tally.app.csvimport.SignMethod
import com.tally.app.csvimport.analyzeCsv
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Unit tests for the pure (non-Compose) CSV import screen logic. */
class CsvImportLogicTest {

    private fun stubCategories(): List<Category> = listOf("Coffee", "Groceries", "Other").mapIndexed { i, label ->
        Category(
            id = "cat-${label.lowercase()}",
            label = label,
            icon = "Circle",
            colorToken = "cat-${i + 1}",
            kind = CategoryKind.WANT,
            builtin = true,
            order = i,
        )
    }

    // -----------------------------------------------------------------------
    // looksBinary
    // -----------------------------------------------------------------------

    @Test
    fun looksBinaryEmptyBytesIsFalse() {
        assertFalse(looksBinary(ByteArray(0)))
    }

    @Test
    fun looksBinaryNulByteIsTrue() {
        val bytes = "date,amount,desc\n01/08/2026".toByteArray(Charsets.UTF_8) + byteArrayOf(0)
        assertTrue(looksBinary(bytes))
    }

    @Test
    fun looksBinaryPlainCsvTextIsFalse() {
        val text = "Date,Amount,Description\n01/08/2026,-4.50,GLORIA JEANS CAFE\n02/08/2026,-12.00,WOOLWORTHS\n"
        assertFalse(looksBinary(text.toByteArray(Charsets.UTF_8)))
    }

    @Test
    fun looksBinaryHighControlCharRatioIsTrue() {
        val bytes = ByteArray(200) { i -> if (i % 2 == 0) 0x01 else 0x41 }
        assertTrue(looksBinary(bytes))
    }

    @Test
    fun looksBinaryNonAsciiMerchantNamesAreNotSuspicious() {
        val text = "Date,Amount,Description\n01/08/2026,-4.50,CAFÉ GOURMAND\n"
        assertFalse(looksBinary(text.toByteArray(Charsets.UTF_8)))
    }

    // -----------------------------------------------------------------------
    // Display names
    // -----------------------------------------------------------------------

    @Test
    fun accountDisplayNameCoversEveryAccount() {
        assertEquals("CBA", accountDisplayName(AccountId.CBA))
        assertEquals("CBA card", accountDisplayName(AccountId.CBA_CARD))
        assertEquals("Bankwest", accountDisplayName(AccountId.BANKWEST))
        assertEquals("Amex", accountDisplayName(AccountId.AMEX))
        assertEquals("Cash", accountDisplayName(AccountId.CASH))
    }

    @Test
    fun bankFormatDisplayNameCoversEveryFormat() {
        assertEquals("CBA", bankFormatDisplayName(BankFormat.CBA))
        assertEquals("Bankwest", bankFormatDisplayName(BankFormat.BANKWEST))
        assertEquals("Amex", bankFormatDisplayName(BankFormat.AMEX))
        assertEquals("an unrecognised bank", bankFormatDisplayName(BankFormat.GENERIC))
    }

    // -----------------------------------------------------------------------
    // describeSignResolution
    // -----------------------------------------------------------------------

    @Test
    fun describeSignResolutionBalanceVerifiedSaysConfirmed() {
        val text = describeSignResolution(SignMethod.BALANCE_VERIFIED, signInverted = false, overridden = false)
        assertTrue(text.contains("Confirmed"))
        assertTrue(text.contains("Negative amounts"))
    }

    @Test
    fun describeSignResolutionOverriddenSaysManual() {
        val text = describeSignResolution(SignMethod.BALANCE_VERIFIED, signInverted = true, overridden = true)
        assertTrue(text.contains("manually"))
        assertTrue(text.contains("Positive amounts"))
    }

    @Test
    fun describeSignResolutionFormatHintSaysLowConfidence() {
        val text = describeSignResolution(SignMethod.FORMAT_HINT, signInverted = true, overridden = false)
        assertTrue(text.contains("Low confidence"))
    }

    // -----------------------------------------------------------------------
    // describeColumn
    // -----------------------------------------------------------------------

    @Test
    fun describeColumnNullIndexIsNotFound() {
        assertEquals("not found", describeColumn(headerRow = listOf("Date", "Amount"), index = null))
    }

    @Test
    fun describeColumnWithHeaderShowsHeaderText() {
        assertEquals("\"Amount\" (column 2)", describeColumn(headerRow = listOf("Date", "Amount"), index = 1))
    }

    @Test
    fun describeColumnWithoutHeaderShowsColumnNumberOnly() {
        assertEquals("column 1", describeColumn(headerRow = null, index = 0))
    }

    @Test
    fun describeColumnBlankHeaderCellFallsBackToColumnNumber() {
        assertEquals("column 2", describeColumn(headerRow = listOf("Date", "   "), index = 1))
    }

    // -----------------------------------------------------------------------
    // previewFailureMessage
    // -----------------------------------------------------------------------

    @Test
    fun previewFailureMessageEmptyFileIsAFailure() {
        val preview = ImportPreview(BankFormat.GENERIC, AccountId.CBA, emptyList(), 0, emptyList(), false)
        assertEquals("This file has no data rows to import.", previewFailureMessage(preview, totalDataRows = 0))
    }

    @Test
    fun previewFailureMessageNoUsableRowsUsesParserWarning() {
        val preview = ImportPreview(
            BankFormat.GENERIC,
            AccountId.CBA,
            emptyList(),
            0,
            listOf("Could not identify required columns — use the manual mapper to select date, description and amount columns."),
            false,
        )
        assertEquals(
            "Could not identify required columns — use the manual mapper to select date, description and amount columns.",
            previewFailureMessage(preview, totalDataRows = 3),
        )
    }

    @Test
    fun previewFailureMessageAllDuplicatesIsNotAFailure() {
        // Every row is a legitimate duplicate — a result to show the user, not an error.
        val preview = ImportPreview(BankFormat.CBA, AccountId.CBA, emptyList(), 5, emptyList(), false)
        assertNull(previewFailureMessage(preview, totalDataRows = 5))
    }

    @Test
    fun previewFailureMessageWithNewRowsIsNotAFailure() {
        val analysis = analyzeCsv("01/08/2026,-4.50,GLORIA JEANS CAFE\n02/08/2026,-12.00,WOOLWORTHS\n")
        val preview = buildPreviewFor(analysis, AccountId.CBA, signInverted = false, rules = emptyList(), categories = stubCategories(), existingHashes = emptySet())
        assertTrue(preview.rows.isNotEmpty())
        assertNull(previewFailureMessage(preview, totalDataRows = analysis.layout.dataRows.size))
    }

    // -----------------------------------------------------------------------
    // buildPreviewFor / recomputeReview
    // -----------------------------------------------------------------------

    @Test
    fun buildPreviewForParsesASimpleHeaderlessFile() {
        val text = "01/08/2026,-4.50,GLORIA JEANS CAFE\n02/08/2026,-12.00,WOOLWORTHS\n"
        val analysis = analyzeCsv(text)
        val preview = buildPreviewFor(analysis, AccountId.CBA, signInverted = false, rules = emptyList(), categories = stubCategories(), existingHashes = emptySet())
        assertEquals(2, preview.rows.size)
        assertEquals(0, preview.duplicateCount)
    }

    @Test
    fun recomputeReviewChangingAccountChangesDedupeGrouping() {
        val text = "01/08/2026,-4.50,GLORIA JEANS CAFE\n"
        val analysis = analyzeCsv(text)
        val categories = stubCategories()
        val firstPreview = buildPreviewFor(analysis, AccountId.CBA, signInverted = false, rules = emptyList(), categories = categories, existingHashes = emptySet())
        val review = CsvImportUiState.Review(
            analysis = analysis,
            account = AccountId.CBA,
            signInverted = false,
            signOverridden = false,
            preview = firstPreview,
            categories = categories,
            rules = emptyList(),
            existingHashes = emptySet(),
        )

        // Re-target to Bankwest with the same (empty) existing-hash set: still a fresh
        // import for that account, so still exactly one new row, not a duplicate.
        val result = recomputeReview(review, account = AccountId.BANKWEST, signInverted = false, signOverridden = false)
        assertTrue(result is CsvImportUiState.Review)
        val updated = result as CsvImportUiState.Review
        assertEquals(AccountId.BANKWEST, updated.account)
        assertEquals(1, updated.preview.rows.size)
        assertEquals(AccountId.BANKWEST, updated.preview.rows[0].account)
    }

    @Test
    fun recomputeReviewSignOverrideIsReflectedInState() {
        val text = "01/08/2026,-4.50,GLORIA JEANS CAFE\n"
        val analysis = analyzeCsv(text)
        val categories = stubCategories()
        val firstPreview = buildPreviewFor(analysis, AccountId.CBA, signInverted = false, rules = emptyList(), categories = categories, existingHashes = emptySet())
        val review = CsvImportUiState.Review(
            analysis = analysis,
            account = AccountId.CBA,
            signInverted = false,
            signOverridden = false,
            preview = firstPreview,
            categories = categories,
            rules = emptyList(),
            existingHashes = emptySet(),
        )

        val result = recomputeReview(review, account = AccountId.CBA, signInverted = true, signOverridden = true)
        assertNotNull(result)
        val updated = result as CsvImportUiState.Review
        assertTrue(updated.signOverridden)
        assertTrue(updated.signInverted)
        // Sign flipped: the same file's one spend row now reads as income (negative cents).
        assertEquals(-450L, updated.preview.rows.first().amountCents)
    }
}
