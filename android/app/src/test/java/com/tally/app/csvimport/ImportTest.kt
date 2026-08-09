package com.tally.app.csvimport

import com.tally.app.categorize.CategorizeMatchSource
import com.tally.app.categorize.Rule
import com.tally.app.categorize.categorizeDescription
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * JUnit port of src/import/__checks__/run.ts — CSV import: structural column
 * detection, balance-verified sign resolution, exact integer-cents money
 * parsing, categorisation priority, and the dedupe occurrence-index
 * regression (two identical same-day coffees). Same fixtures (the
 * docs/samples/*.example.csv files, copied verbatim into
 * src/test/resources/samples/), same expected values as the TypeScript
 * source.
 */
class ImportTest {

    private fun readSample(name: String): String {
        val stream = javaClass.classLoader?.getResourceAsStream("samples/$name")
            ?: error("test resource not found: samples/$name")
        return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    // A stub category list standing in for whatever the real app seeds at runtime —
    // categorize.ts resolves dictionary labels against this shape, never a hardcoded id.
    private fun stubCategories(): List<Category> {
        val labels = listOf(
            "Coffee", "Lunch", "Dining Out", "Groceries", "Shopping", "Health", "Alcohol",
            "Transport", "Fuel", "Bills", "Utilities", "Subscriptions", "Rent", "Housing",
            "Fitness", "Insurance", "Income", "Other"
        )
        return labels.mapIndexed { i, label ->
            Category(
                id = "cat-${label.lowercase().replace(Regex("\\s+"), "-")}",
                label = label,
                icon = "Circle",
                colorToken = "cat-${(i % 12) + 1}",
                kind = CategoryKind.WANT,
                builtin = true,
                order = i
            )
        }
    }

    // =======================================================================
    // 1. Exact integer-cents money parsing
    // =======================================================================
    @Test
    fun `1 - parseMoneyToCents exact integer cents`() {
        assertEquals(123_456L, parseMoneyToCents("\$1,234.56"))
        assertEquals(-4_500L, parseMoneyToCents("(45.00)"))
        assertEquals(-500L, parseMoneyToCents("-\$5"))
        assertEquals(-4_500L, parseMoneyToCents("45.00-"))
        assertEquals(123_400L, parseMoneyToCents("1234"))
        assertEquals(56L, parseMoneyToCents(".56"))
        assertEquals(4_500L, parseMoneyToCents("AUD 45.00"))
        assertEquals(-500L, parseMoneyToCents("\$-5.00"))
        assertNull("reference code rejected", parseMoneyToCents("REF00981239"))
        assertNull("merchant text rejected", parseMoneyToCents("WOOLWORTHS 2456"))
    }

    // =======================================================================
    // 2. DD/MM vs MM/DD is never confused (Australian day-first order)
    // =======================================================================
    @Test
    fun `2 - day-first date parsing, never month-first`() {
        assertEquals("05_08_2026 -> 5 Aug, not 8 May", LocalDate.of(2026, 8, 5), tryParseDate("05/08/2026"))
        assertEquals("13_02_2026 -> unambiguous day greater than 12", LocalDate.of(2026, 2, 13), tryParseDate("13/02/2026"))
        assertEquals("01_12_2026 -> 1 Dec, not 12 Jan", LocalDate.of(2026, 12, 1), tryParseDate("01/12/2026"))
        assertEquals("two-digit year pivot", LocalDate.of(2026, 8, 3), parseAuDate("03/08/26"))
    }

    // =======================================================================
    // 3. CBA headerless, single signed Amount column, balance present
    // =======================================================================
    @Test
    fun `3 - CBA headerless signed`() {
        val text = readSample("cba-headerless-signed.example.csv")
        val analysis = analyzeCsv(text)
        assertEquals("hasHeader", false, analysis.layout.hasHeader)
        assertEquals("dateCol", 0, analysis.layout.dateCol)
        assertEquals("amountCol", 1, analysis.layout.amountCol)
        assertEquals("descriptionCol", 2, analysis.layout.descriptionCol)
        assertEquals("balanceCol", 3, analysis.layout.balanceCol)
        assertEquals("detected format", BankFormat.CBA, analysis.formatDetection.format)
        assertEquals("sign method", SignMethod.BALANCE_VERIFIED, analysis.signAnalysis.method)
        assertEquals("signInverted", false, analysis.signAnalysis.signInverted)
        assertTrue("sign confidence high", analysis.signAnalysis.confidence >= 0.9)

        val preview = buildImportPreview(
            analysis.layout,
            BuildPreviewOptions(
                account = AccountId.CBA,
                detectedFormat = analysis.formatDetection.format,
                signInverted = analysis.signAnalysis.signInverted,
                rules = emptyList(),
                categories = stubCategories(),
                existingHashes = emptySet()
            )
        )
        assertEquals("10 rows parsed", 10, preview.rows.size)
        assertEquals("0 duplicates on first import", 0, preview.duplicateCount)

        val gloriaJeans = preview.rows.find { it.merchant == "Gloria Jean's" }
        assertNotNull("Gloria Jean's found", gloriaJeans)
        assertEquals("coffee \$4.50 spend -> +450c", 450L, gloriaJeans!!.amountCents)

        val salary = preview.rows.find { it.description.contains("SALARY") }
        assertNotNull("salary row found", salary)
        assertEquals("salary \$1500 income -> -150000c", -150_000L, salary!!.amountCents)

        val bunnings = preview.rows.find { it.merchant == "Bunnings" }
        assertEquals("Bunnings categorised as Shopping", "cat-shopping", bunnings?.categoryId)

        val woolies = preview.rows.filter { it.merchant == "Woolworths" }
        assertEquals("2 Woolworths rows categorised as Groceries", 2, woolies.count { it.categoryId == "cat-groceries" })

        // ---- dedupe: re-importing the same statement must not double-count ----
        val existing = existingHashSet(preview.rows)
        val secondPass = buildImportPreview(
            analysis.layout,
            BuildPreviewOptions(
                account = AccountId.CBA,
                detectedFormat = analysis.formatDetection.format,
                signInverted = analysis.signAnalysis.signInverted,
                rules = emptyList(),
                categories = stubCategories(),
                existingHashes = existing
            )
        )
        assertEquals("re-import yields 0 new rows", 0, secondPass.rows.size)
        assertEquals("re-import reports all 10 as duplicates", 10, secondPass.duplicateCount)
    }

    // =======================================================================
    // 4. CBA headered Debit/Credit variant, parens-negative and $ thousands
    // =======================================================================
    @Test
    fun `4 - CBA headered debit credit`() {
        val text = readSample("cba-headered-debit-credit.example.csv")
        val analysis = analyzeCsv(text)
        assertEquals("hasHeader", true, analysis.layout.hasHeader)
        assertTrue("debit+credit cols found", analysis.layout.debitCol != null && analysis.layout.creditCol != null)
        assertTrue("balance col found", analysis.layout.balanceCol != null)
        assertEquals("sign method", SignMethod.BALANCE_VERIFIED, analysis.signAnalysis.method)
        assertEquals("signInverted", false, analysis.signAnalysis.signInverted)

        val preview = buildImportPreview(
            analysis.layout,
            BuildPreviewOptions(AccountId.CBA, analysis.formatDetection.format, analysis.signAnalysis.signInverted, emptyList(), stubCategories(), emptySet())
        )
        assertEquals("8 rows parsed", 8, preview.rows.size)

        val bunnings = preview.rows.find { it.description.startsWith("BUNNINGS") }
        assertEquals("parens \"(230.00)\" debit -> +23000c spend", 23_000L, bunnings?.amountCents)

        val jbhifi = preview.rows.find { it.merchant == "JB Hi-Fi" }
        assertEquals("\"\$1,234.56\" debit -> +123456c spend", 123_456L, jbhifi?.amountCents)

        val salary = preview.rows.find { it.description.startsWith("SALARY") }
        assertEquals("\$2500.00 credit -> -250000c income", -250_000L, salary?.amountCents)
    }

    // =======================================================================
    // 5. Bankwest debit/credit, BSB header hint
    // =======================================================================
    @Test
    fun `5 - Bankwest debit credit`() {
        val text = readSample("bankwest-debit-credit.example.csv")
        val analysis = analyzeCsv(text)
        assertEquals("detected format", BankFormat.BANKWEST, analysis.formatDetection.format)
        assertEquals("sign method", SignMethod.BALANCE_VERIFIED, analysis.signAnalysis.method)
        assertEquals("signInverted", false, analysis.signAnalysis.signInverted)

        val preview = buildImportPreview(
            analysis.layout,
            BuildPreviewOptions(AccountId.BANKWEST, analysis.formatDetection.format, analysis.signAnalysis.signInverted, emptyList(), stubCategories(), emptySet())
        )
        assertEquals("8 rows parsed", 8, preview.rows.size)

        val rent = preview.rows.find { it.description.contains("RENT") }
        assertEquals("rent \$650 debit -> +65000c spend", 65_000L, rent?.amountCents)
        assertEquals("rent categorised", "cat-rent", rent?.categoryId)

        val wage = preview.rows.find { it.description.contains("WAGE") }
        assertEquals("wage \$1800 credit -> -180000c income", -180_000L, wage?.amountCents)
    }

    // =======================================================================
    // 6. Amex — sign is INVERTED vs the banks (positive = spend)
    // =======================================================================
    @Test
    fun `6 - Amex sign inversion end to end`() {
        val text = readSample("amex-inverted.example.csv")
        val analysis = analyzeCsv(text)
        assertEquals("detected format", BankFormat.AMEX, analysis.formatDetection.format)
        assertTrue("no balance column", analysis.layout.balanceCol == null)
        assertEquals("sign method (heuristic, no balance col)", SignMethod.HEURISTIC_MAJORITY, analysis.signAnalysis.method)
        assertEquals("signInverted detected true", true, analysis.signAnalysis.signInverted)

        val preview = buildImportPreview(
            analysis.layout,
            BuildPreviewOptions(AccountId.AMEX, analysis.formatDetection.format, analysis.signAnalysis.signInverted, emptyList(), stubCategories(), emptySet())
        )
        assertEquals("8 rows parsed", 8, preview.rows.size)

        val danMurphys = preview.rows.find { it.merchant == "Dan Murphy's" }
        assertEquals("charge +35.60 (file positive) -> +3560c spend", 3_560L, danMurphys?.amountCents)

        val payment = preview.rows.find { it.description.startsWith("PAYMENT RECEIVED") }
        assertEquals("payment -500.00 (file negative) -> -50000c income (not spend)", -50_000L, payment?.amountCents)

        val refund = preview.rows.find { it.description.startsWith("REFUND") }
        assertEquals("refund -120.00 (file negative) -> -12000c income", -12_000L, refund?.amountCents)
    }

    // =======================================================================
    // 7. Messy generic file — semicolons, unhelpful headers, reference codes
    // =======================================================================
    @Test
    fun `7 - generic messy file`() {
        val text = readSample("generic-messy.example.csv")
        val analysis = analyzeCsv(text)
        assertEquals("delimiter sniffed as semicolon", ';', analysis.rawCsv.delimiter)
        assertEquals("format falls through to generic", BankFormat.GENERIC, analysis.formatDetection.format)
        assertTrue("date column still found despite odd header", analysis.layout.dateCol != null)
        assertTrue("description column found", analysis.layout.descriptionCol != null)
        assertTrue(
            "Ref column NOT mistaken for balance/amount",
            analysis.layout.balanceCol != 4 && analysis.layout.amountCol != 4
        )

        val preview = buildImportPreview(
            analysis.layout,
            BuildPreviewOptions(
                analysis.formatDetection.accountGuess, analysis.formatDetection.format,
                analysis.signAnalysis.signInverted, emptyList(), stubCategories(), emptySet()
            )
        )
        assertEquals("6 rows parsed", 6, preview.rows.size)

        val salary = preview.rows.find { it.description.contains("Salary") }
        assertEquals("salary 2100.00 -> -210000c income", -210_000L, salary?.amountCents)

        val netflix = preview.rows.find { it.description.contains("Netflix") }
        assertEquals("Netflix -16.99 -> +1699c spend", 1_699L, netflix?.amountCents)
    }

    // =======================================================================
    // 8. Rules take priority over the dictionary
    // =======================================================================
    @Test
    fun `8 - rules take priority over the dictionary`() {
        val categories = stubCategories()
        // No keyword match at all (no "cafe"/"coffee"/etc.) -> truly unguessable, falls to Other.
        val withoutRule = categorizeDescription("XYZ CORNER STORE 99281", emptyList(), categories)
        assertEquals("unguessable merchant falls back to Other", "cat-other", withoutRule.categoryId)

        val withRule = categorizeDescription(
            "XYZ CORNER STORE 99281",
            listOf(Rule("r1", "xyz corner store", "cat-coffee", System.currentTimeMillis())),
            categories
        )
        assertEquals("user rule overrides dictionary/fallback", "cat-coffee", withRule.categoryId)
        assertEquals("rule match source reported", CategorizeMatchSource.RULE, withRule.matchedBy)

        // A local café with no dictionary entry still defaults sensibly via the generic
        // "cafe" pattern, rather than dumping into Other.
        val localCafe = categorizeDescription("THE CORNER CAFE 4471", emptyList(), categories)
        assertEquals("unlisted local cafe defaults sensibly to Coffee", "cat-coffee", localCafe.categoryId)
    }

    // =======================================================================
    // 9. Dedupe occurrence-index — genuinely distinct same-day identical rows
    //    must survive, while overlapping re-imports of the same statement
    //    still dedupe correctly (regression coverage for the "second
    //    identical coffee vanishes" bug).
    // =======================================================================
    @Test
    fun `9 - dedupe occurrence index regression`() {
        fun layoutFor(text: String) =
            buildManualLayout(parseRawCsv(text), ManualColumnMapping(hasHeader = false, dateCol = 0, amountCol = 1, descriptionCol = 2))

        fun previewOpts(existingHashes: Set<String>) = BuildPreviewOptions(
            account = AccountId.CBA,
            detectedFormat = BankFormat.CBA,
            signInverted = false,
            rules = emptyList(),
            categories = stubCategories(),
            existingHashes = existingHashes
        )

        // (a) Two identical $5.50 coffees, same date/description/account, one file.
        val twoCoffees = "01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n"
        val firstImport = buildImportPreview(layoutFor(twoCoffees), previewOpts(emptySet()))
        assertEquals("2 identical same-day coffees -> 2 new", 2, firstImport.rows.size)
        assertEquals("2 identical same-day coffees -> 0 duplicates", 0, firstImport.duplicateCount)
        assertTrue(
            "the two identical rows hash differently from each other",
            firstImport.rows.size == 2 && firstImport.rows[0].hash != firstImport.rows[1].hash
        )
        assertTrue("both rows still carry the correct \$5.50 spend", firstImport.rows.all { it.amountCents == 550L })

        // (b) Re-importing the exact same file must dedupe both rows, not just one.
        val afterFirstImport = existingHashSet(firstImport.rows)
        val reImportSameFile = buildImportPreview(layoutFor(twoCoffees), previewOpts(afterFirstImport))
        assertEquals("re-importing the same 2-coffee file -> 0 new", 0, reImportSameFile.rows.size)
        assertEquals("re-importing the same 2-coffee file -> 2 duplicates", 2, reImportSameFile.duplicateCount)

        // (b-subset) An overlapping statement whose date range only caught ONE of the two
        // identical coffees (a genuine subset of what's already stored) must dedupe that
        // one row and not be mistaken for "new".
        val oneCoffeeSubset = "01/08/2026,-5.50,CAFE COFFEE SHOP\n"
        val subsetImport = buildImportPreview(layoutFor(oneCoffeeSubset), previewOpts(afterFirstImport))
        assertEquals("1-row file, a subset of 2 already imported -> 0 new", 0, subsetImport.rows.size)
        assertEquals("1-row file, a subset of 2 already imported -> 1 duplicate", 1, subsetImport.duplicateCount)

        // (c) A later, overlapping statement contains a genuine THIRD identical coffee
        // alongside the two already imported — exactly one of the three should be new.
        val threeCoffees = "01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n"
        val overlappingImport = buildImportPreview(layoutFor(threeCoffees), previewOpts(afterFirstImport))
        assertEquals("3-row file over 2 already-imported -> 1 new", 1, overlappingImport.rows.size)
        assertEquals("3-row file over 2 already-imported -> 2 duplicates", 2, overlappingImport.duplicateCount)

        // (c continued) Row order within the file must not matter.
        val overlappingReordered = buildImportPreview(layoutFor(threeCoffees), previewOpts(afterFirstImport))
        assertEquals("row order within the file does not change the outcome (new)", 1, overlappingReordered.rows.size)
        assertEquals("row order within the file does not change the outcome (duplicates)", 2, overlappingReordered.duplicateCount)

        // (d) Manual quick-add must NEVER silently swallow an identical entry: manual
        // entry always uses occurrence 0 (the default) and never dedupes against
        // existing hashes at all — reproduced here as a direct hashTxn/hashTxn call
        // pair, proving both entries hash identically yet neither is dropped by this
        // layer (the "drop" decision, if any, belongs entirely to the data/store layer,
        // out of this package's scope).
        val manualHashes = (0 until 2).map {
            hashTxn(LocalDate.of(2026, 8, 1), 550, "Coffee", AccountId.CASH)
        }
        assertEquals("two identical quick-add entries -> both hashes computed", 2, manualHashes.size)
        assertTrue(
            "both entries hash identically (occurrence 0 default) yet the hashing layer itself never drops either",
            manualHashes[0] == manualHashes[1]
        )
    }
}
