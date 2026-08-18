package com.tally.app.ui.accounts

import com.tally.app.money.AccountBalance
import com.tally.app.money.AccountId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * JUnit tests for the exact wording DESIGN-V5.md §2 makes non-negotiable:
 * never "available"/"current"/a bare "balance", always an as-at date on a
 * derived figure, a card always says "owed" (or "in credit"), and "no
 * imports" renders as words, never as a `$0.00` figure.
 */
class AccountRowPresentationTest {

    private val bannedWords = listOf("available", "current", "balance")

    private fun assertNoBannedWords(text: String) {
        val lower = text.lowercase()
        for (word in bannedWords) {
            assertTrue("subtitle '$text' must not contain the word '$word'", !lower.contains(word))
        }
    }

    @Test
    fun `no imports says exactly that, and shows no trailing figure`() {
        val row = accountRowPresentation(AccountBalance.NoImports(AccountId.AMEX))
        assertEquals("Amex", row.title)
        assertNull(row.trailingCents)
        assertEquals("Nothing imported yet", row.subtitle)
        assertNoBannedWords(row.subtitle)
    }

    @Test
    fun `a bank account with data shows the net figure and an as-at date, never bank words`() {
        val balance = AccountBalance.Derived(
            accountId = AccountId.CBA,
            derivedBalanceCents = 32_000,
            asAtDate = LocalDate.of(2026, 8, 2),
            txnCount = 5,
        )
        val row = accountRowPresentation(balance)
        assertEquals("CBA", row.title)
        assertEquals(32_000L, row.trailingCents)
        assertEquals("Net out, from your imports, to 2 Aug", row.subtitle)
        assertNoBannedWords(row.subtitle)
    }

    @Test
    fun `a bank account that received more than it spent reads net in`() {
        val balance = AccountBalance.Derived(
            accountId = AccountId.BANKWEST,
            derivedBalanceCents = -15_000,
            asAtDate = LocalDate.of(2026, 8, 5),
            txnCount = 2,
        )
        val row = accountRowPresentation(balance)
        assertEquals(15_000L, row.trailingCents)
        assertEquals("Net in, from your imports, to 5 Aug", row.subtitle)
    }

    @Test
    fun `a card with data says the figure is owed, with an as-at date`() {
        val balance = AccountBalance.Derived(
            accountId = AccountId.AMEX,
            derivedBalanceCents = 120_455,
            asAtDate = LocalDate.of(2026, 8, 2),
            txnCount = 18,
        )
        val row = accountRowPresentation(balance)
        assertEquals("Amex", row.title)
        assertEquals(120_455L, row.trailingCents)
        assertEquals("Owed, from your imports, to 2 Aug", row.subtitle)
        assertTrue(row.subtitle.contains("Owed"))
        assertNoBannedWords(row.subtitle)
    }

    @Test
    fun `a card that has been overpaid reads in credit, not a negative owed figure`() {
        val balance = AccountBalance.Derived(
            accountId = AccountId.CBA_CARD,
            derivedBalanceCents = -500,
            asAtDate = LocalDate.of(2026, 8, 2),
            txnCount = 4,
        )
        val row = accountRowPresentation(balance)
        assertEquals(500L, row.trailingCents)
        assertEquals("In credit, from your imports, to 2 Aug", row.subtitle)
    }
}
