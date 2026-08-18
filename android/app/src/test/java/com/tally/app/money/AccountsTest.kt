package com.tally.app.money

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * JUnit tests for `Accounts.kt` (DESIGN-V5.md §2) — the derived accounts
 * list Home now shows instead of a category-first dashboard. The one thing
 * every test here is ultimately guarding: an account with no imports must
 * never be readable as, or confusable with, a genuine zero balance.
 */
class AccountsTest {

    private var txnCounter = 0

    private fun mkTxn(
        account: AccountId,
        amountCents: Cents,
        date: LocalDate,
    ): Txn {
        txnCounter++
        return Txn(
            id = "txn-$txnCounter",
            date = date,
            amountCents = amountCents,
            description = "fixture",
            merchant = "fixture",
            categoryId = "cat-other",
            account = account,
            source = TxnSource.CSV,
            hash = "hash-$txnCounter",
        )
    }

    // -------------------------------------------------------------------
    // 1. Coverage: every AccountId gets a row, always, in declared order.
    // -------------------------------------------------------------------

    @Test
    fun `every account id gets exactly one row`() {
        val rows = buildAccountBalances(emptyList())
        assertEquals(AccountId.entries.size, rows.size)
        assertEquals(AccountId.entries.toList(), rows.map { it.accountId })
    }

    // -------------------------------------------------------------------
    // 2. The critical rule: no imports is not zero.
    // -------------------------------------------------------------------

    @Test
    fun `an account with no transactions reports NoImports, not a zero Derived row`() {
        val rows = buildAccountBalances(emptyList())
        val amex = rows.first { it.accountId == AccountId.AMEX }
        assertTrue(amex is AccountBalance.NoImports)
        assertFalse(amex.hasData)
        assertEquals(0, amex.txnCount)
    }

    @Test
    fun `only accounts with at least one transaction become Derived`() {
        val txns = listOf(mkTxn(AccountId.CBA, 5_000, LocalDate.of(2026, 8, 1)))
        val rows = buildAccountBalances(txns)
        val cba = rows.first { it.accountId == AccountId.CBA }
        val bankwest = rows.first { it.accountId == AccountId.BANKWEST }
        assertTrue(cba is AccountBalance.Derived)
        assertTrue(bankwest is AccountBalance.NoImports)
    }

    // -------------------------------------------------------------------
    // 3. Kind is computed from the account id and cannot be mismatched.
    // -------------------------------------------------------------------

    @Test
    fun `bank and cash accounts are BANK kind, cards are CARD kind`() {
        assertEquals(AccountKind.BANK, AccountBalance.NoImports(AccountId.CBA).kind)
        assertEquals(AccountKind.BANK, AccountBalance.NoImports(AccountId.BANKWEST).kind)
        assertEquals(AccountKind.BANK, AccountBalance.NoImports(AccountId.CASH).kind)
        assertEquals(AccountKind.CARD, AccountBalance.NoImports(AccountId.CBA_CARD).kind)
        assertEquals(AccountKind.CARD, AccountBalance.NoImports(AccountId.AMEX).kind)
    }

    // -------------------------------------------------------------------
    // 4. The sum, the as-at date and the count.
    // -------------------------------------------------------------------

    @Test
    fun `derivedBalanceCents is the sum of that account's own transactions only`() {
        val txns = listOf(
            mkTxn(AccountId.AMEX, 10_000, LocalDate.of(2026, 8, 1)),
            mkTxn(AccountId.AMEX, 5_000, LocalDate.of(2026, 8, 2)),
            mkTxn(AccountId.AMEX, -2_000, LocalDate.of(2026, 8, 3)), // a payment
            mkTxn(AccountId.CBA, 99_999, LocalDate.of(2026, 8, 1)), // different account, must not leak in
        )
        val amex = buildAccountBalances(txns).first { it.accountId == AccountId.AMEX } as AccountBalance.Derived
        assertEquals(13_000L, amex.derivedBalanceCents)
        assertEquals(3, amex.txnCount)
    }

    @Test
    fun `asAtDate is the most recent transaction date for that account`() {
        val txns = listOf(
            mkTxn(AccountId.CBA, 1_000, LocalDate.of(2026, 8, 2)),
            mkTxn(AccountId.CBA, 1_000, LocalDate.of(2026, 8, 9)),
            mkTxn(AccountId.CBA, 1_000, LocalDate.of(2026, 7, 30)),
        )
        val cba = buildAccountBalances(txns).first { it.accountId == AccountId.CBA } as AccountBalance.Derived
        assertEquals(LocalDate.of(2026, 8, 9), cba.asAtDate)
    }

    // -------------------------------------------------------------------
    // 5. A card's figure is what's owed; a charge and a payment both feed
    //    the same sum, in opposite directions, per Types.kt's sign
    //    convention (positive = spend, negative = income).
    // -------------------------------------------------------------------

    @Test
    fun `a card charge increases owed and a card payment reduces it`() {
        val charged = buildAccountBalances(
            listOf(mkTxn(AccountId.CBA_CARD, 12_045, LocalDate.of(2026, 8, 2))),
        ).first { it.accountId == AccountId.CBA_CARD } as AccountBalance.Derived
        assertEquals(12_045L, charged.derivedBalanceCents)

        val paidDown = buildAccountBalances(
            listOf(
                mkTxn(AccountId.CBA_CARD, 12_045, LocalDate.of(2026, 8, 2)),
                mkTxn(AccountId.CBA_CARD, -12_045, LocalDate.of(2026, 8, 10)),
            ),
        ).first { it.accountId == AccountId.CBA_CARD } as AccountBalance.Derived
        assertEquals(0L, paidDown.derivedBalanceCents)
    }
}
