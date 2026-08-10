package com.tally.app.ui.statements

import com.tally.app.money.AccountId
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/** Unit tests for the pure (non-Compose) statements screen logic. */
class StatementsLogicTest {

    private fun txn(
        date: LocalDate,
        account: AccountId,
        source: TxnSource,
        idSuffix: String = date.toString() + account.id + source,
    ): Txn = Txn(
        id = idSuffix,
        date = date,
        amountCents = 100L,
        description = "test",
        merchant = "Test Merchant",
        categoryId = "cat-other",
        account = account,
        source = source,
        hash = "hash-$idSuffix",
    )

    // -----------------------------------------------------------------------
    // buildStatementStatuses
    // -----------------------------------------------------------------------

    @Test
    fun noTransactionsMeansNothingImportedForAnyAccount() {
        val today = LocalDate.of(2026, 8, 10)
        val statuses = buildStatementStatuses(emptyList(), today)
        assertEquals(STATEMENT_ACCOUNTS.size, statuses.size)
        statuses.forEach { status ->
            assertNull(status.lastImportedThrough)
            assertNull(status.daysSinceLastImport)
        }
    }

    @Test
    fun cashIsNotAStatementAccount() {
        assertEquals(false, STATEMENT_ACCOUNTS.contains(AccountId.CASH))
    }

    @Test
    fun picksTheMostRecentCsvDateForEachAccount() {
        val today = LocalDate.of(2026, 8, 10)
        val txns = listOf(
            txn(LocalDate.of(2026, 7, 1), AccountId.CBA, TxnSource.CSV, "a"),
            txn(LocalDate.of(2026, 8, 1), AccountId.CBA, TxnSource.CSV, "b"),
            txn(LocalDate.of(2026, 7, 15), AccountId.CBA, TxnSource.CSV, "c"),
        )
        val cbaStatus = buildStatementStatuses(txns, today).first { it.account == AccountId.CBA }
        assertEquals(LocalDate.of(2026, 8, 1), cbaStatus.lastImportedThrough)
        assertEquals(9, cbaStatus.daysSinceLastImport)
    }

    @Test
    fun manualEntriesDoNotCountAsAStatementImport() {
        val today = LocalDate.of(2026, 8, 10)
        val txns = listOf(txn(LocalDate.of(2026, 8, 9), AccountId.BANKWEST, TxnSource.MANUAL))
        val status = buildStatementStatuses(txns, today).first { it.account == AccountId.BANKWEST }
        assertNull(status.lastImportedThrough)
    }

    @Test
    fun differentAccountsAreTrackedIndependently() {
        val today = LocalDate.of(2026, 8, 10)
        val txns = listOf(
            txn(LocalDate.of(2026, 8, 1), AccountId.CBA, TxnSource.CSV, "cba"),
            txn(LocalDate.of(2026, 7, 20), AccountId.AMEX, TxnSource.CSV, "amex"),
        )
        val statuses = buildStatementStatuses(txns, today).associateBy { it.account }
        assertEquals(LocalDate.of(2026, 8, 1), statuses.getValue(AccountId.CBA).lastImportedThrough)
        assertEquals(LocalDate.of(2026, 7, 20), statuses.getValue(AccountId.AMEX).lastImportedThrough)
        assertNull(statuses.getValue(AccountId.BANKWEST).lastImportedThrough)
        assertNull(statuses.getValue(AccountId.CBA_CARD).lastImportedThrough)
    }

    // -----------------------------------------------------------------------
    // nextStatementDay
    // -----------------------------------------------------------------------

    @Test
    fun nextStatementDayBeforeFirstSaturdayReturnsThatSaturday() {
        // 3 Aug 2026 is a Monday; the first Saturday of August 2026 is the 1st.
        // Use a date before it within the same month instead: 1 Feb 2026 is a
        // Sunday, so the first Saturday of Feb 2026 is the 7th.
        val from = LocalDate.of(2026, 2, 1)
        assertEquals(LocalDate.of(2026, 2, 7), nextStatementDay(from))
    }

    @Test
    fun nextStatementDayOnTheDayItselfReturnsTheSameDate() {
        val firstSaturday = LocalDate.of(2026, 2, 7)
        assertEquals(firstSaturday, nextStatementDay(firstSaturday))
    }

    @Test
    fun nextStatementDayAfterFirstSaturdayRollsToNextMonth() {
        val from = LocalDate.of(2026, 2, 8) // the day after Feb 2026's first Saturday
        // March 2026's 1st is a Sunday, so its first Saturday is the 7th.
        assertEquals(LocalDate.of(2026, 3, 7), nextStatementDay(from))
    }

    @Test
    fun nextStatementDayWhenFirstOfMonthIsAlreadySaturday() {
        // 1 Aug 2026 is itself a Saturday.
        val from = LocalDate.of(2026, 8, 1)
        assertEquals(LocalDate.of(2026, 8, 1), nextStatementDay(from))
    }

    // -----------------------------------------------------------------------
    // accountDisplayName
    // -----------------------------------------------------------------------

    @Test
    fun accountDisplayNameCoversEveryAccount() {
        assertEquals("CBA", accountDisplayName(AccountId.CBA))
        assertEquals("CBA card", accountDisplayName(AccountId.CBA_CARD))
        assertEquals("Bankwest", accountDisplayName(AccountId.BANKWEST))
        assertEquals("Amex", accountDisplayName(AccountId.AMEX))
        assertEquals("Cash", accountDisplayName(AccountId.CASH))
    }
}
