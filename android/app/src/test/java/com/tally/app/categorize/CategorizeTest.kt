package com.tally.app.categorize

import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * BONUS coverage for `cleanMerchant`/`normaliseForMatch` (src/categorize/normalize.ts)
 * beyond the merchant names already exercised end-to-end via CSV fixtures in
 * `ImportTest`. Not part of the ported 911 (normalize.ts has no dedicated
 * web-side check suite of its own — it's exercised indirectly through
 * import/__checks__/run.ts's merchant assertions, all of which are already
 * ported in `ImportTest`). These pin down the noise-stripping rules directly.
 */
class CategorizeTest {

    private fun categories(): List<Category> = listOf(
        Category("cat-other", "Other", "Circle", "cat-1", CategoryKind.WANT, true, 0),
        Category("cat-coffee", "Coffee", "Coffee", "cat-2", CategoryKind.WANT, true, 1)
    )

    @Test
    fun `cleanMerchant strips EFTPOS and POS purchase prefixes`() {
        assertEquals("Woolworths 2456", cleanMerchant("EFTPOS PURCHASE WOOLWORTHS 2456"))
        assertEquals("Bunnings", cleanMerchant("POS PURCHASE BUNNINGS"))
    }

    @Test
    fun `cleanMerchant strips payment-processor markers`() {
        assertEquals("The Local Roasters", cleanMerchant("SQ *THE LOCAL ROASTERS"))
        assertEquals("Spotify", cleanMerchant("PAYPAL *SPOTIFY"))
    }

    @Test
    fun `cleanMerchant strips masked card numbers and long reference runs`() {
        assertEquals("Kmart", cleanMerchant("KMART CARD ENDING XX1234"))
        assertEquals("Woolworths Metro", cleanMerchant("WOOLWORTHS METRO 998877"))
    }

    @Test
    fun `cleanMerchant strips trailing AU state codes`() {
        assertEquals("Bunnings 118 Alexandria", cleanMerchant("BUNNINGS 118 ALEXANDRIA NSW"))
    }

    @Test
    fun `cleanMerchant preserves known acronyms in display case`() {
        assertEquals("BWS", cleanMerchant("bws"))
        assertEquals("KFC", cleanMerchant("kfc"))
    }

    @Test
    fun `cleanMerchant falls back to the raw trimmed text when everything strips away`() {
        // A description that is ENTIRELY noise tokens strips to empty, so cleanMerchant
        // falls back to the original trimmed text rather than returning "".
        val raw = "EFTPOS PURCHASE"
        val cleaned = cleanMerchant(raw)
        assertEquals(raw.trim(), cleaned)
    }

    @Test
    fun `normaliseForMatch is lowercase and stable`() {
        // "2456" is only 4 digits — the reference-number stripper only removes bare runs
        // of 6+ digits (or masked-card patterns), so a short numeric suffix like a store
        // number survives cleaning; normaliseForMatch just lowercases cleanMerchant's output.
        assertEquals("woolworths 2456", normaliseForMatch("EFTPOS PURCHASE WOOLWORTHS 2456"))
    }

    @Test
    fun `categorizeDescription falls back to Other when nothing matches`() {
        val result = categorizeDescription("UNKNOWN MERCHANT XYZ123", emptyList(), categories())
        assertEquals("cat-other", result.categoryId)
        assertEquals(CategorizeMatchSource.UNMATCHED, result.matchedBy)
    }

    @Test
    fun `categorizeDescription matches the branded dictionary for a known merchant`() {
        val result = categorizeDescription("WOOLWORTHS 2456 SYDNEY NSW", emptyList(), categories())
        // "Groceries" isn't in this stub category list, so it falls through to the next
        // candidate label ("Shopping"), then "Other" — proving the fallback chain, not
        // just the top pick.
        assertEquals("cat-other", result.categoryId)
        assertEquals("Woolworths", result.merchant)
        assertEquals(CategorizeMatchSource.DICTIONARY, result.matchedBy)
    }
}
