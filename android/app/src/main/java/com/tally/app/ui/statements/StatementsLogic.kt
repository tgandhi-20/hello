package com.tally.app.ui.statements

import com.tally.app.money.AccountId
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.money.daysBetween
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/**
 * Pure (non-Compose, non-Android) logic for the statements screen — kept
 * separate from StatementsScreen.kt so it is directly JUnit-testable on the
 * host JVM. Everything here derives only from what VaultRepository actually
 * has (a transaction's own date, amount, account and source) — nothing about
 * a bank's real statement cycle is invented.
 */

/** The CSV-importable bank/card accounts this screen reports on. Cash is
 *  excluded — there is no bank statement to export for manually-logged spend. */
val STATEMENT_ACCOUNTS: List<AccountId> = listOf(AccountId.CBA, AccountId.CBA_CARD, AccountId.BANKWEST, AccountId.AMEX)

/** Short display name for an account — never a raw enum id on screen. */
fun accountDisplayName(account: AccountId): String = when (account) {
    AccountId.CBA -> "CBA"
    AccountId.CBA_CARD -> "CBA card"
    AccountId.BANKWEST -> "Bankwest"
    AccountId.AMEX -> "Amex"
    AccountId.CASH -> "Cash"
}

data class AccountStatementStatus(
    val account: AccountId,
    /** The most recent date covered by an imported CSV row for this account —
     *  derived from the imported transactions' own dates, never a bank's real
     *  statement-period end (this app has no way to know that). Null when
     *  nothing has ever been imported for this account. */
    val lastImportedThrough: LocalDate?,
    val daysSinceLastImport: Int?,
)

/**
 * For each of [STATEMENT_ACCOUNTS], the most recent date covered by a CSV
 * import, derived purely from [txns] already in the ledger (VaultRepository's
 * own data) — an account with no CSV-sourced transaction yet reports null
 * rather than a guessed date.
 */
fun buildStatementStatuses(txns: List<Txn>, today: LocalDate): List<AccountStatementStatus> =
    STATEMENT_ACCOUNTS.map { account ->
        val lastDate = txns
            .asSequence()
            .filter { it.account == account && it.source == TxnSource.CSV }
            .maxByOrNull { it.date }
            ?.date
        AccountStatementStatus(
            account = account,
            lastImportedThrough = lastDate,
            daysSinceLastImport = lastDate?.let { daysBetween(it, today) },
        )
    }

/**
 * The next occurrence of the user's own routine day (docs/PERSONAL.md §8:
 * "First Saturday — export CSVs from CBA, Amex and Bankwest; review against
 * budget; pay Amex in full") on or after [from]. Pure calendar math, not a
 * financial figure — this is the one date in the routine this screen can
 * compute without any vault data at all.
 */
fun nextStatementDay(from: LocalDate): LocalDate {
    val firstOfThisMonth = from.withDayOfMonth(1)
    val firstSaturdayThisMonth = firstOfThisMonth.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))
    if (!firstSaturdayThisMonth.isBefore(from)) return firstSaturdayThisMonth
    val firstOfNextMonth = firstOfThisMonth.plusMonths(1)
    return firstOfNextMonth.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))
}
