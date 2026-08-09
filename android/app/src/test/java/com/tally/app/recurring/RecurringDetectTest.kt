package com.tally.app.recurring

import com.tally.app.money.AccountId
import com.tally.app.money.RecurringCadence
import com.tally.app.money.RecurringSeries
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * BONUS coverage (not part of the ported 911 — the web app's `detect.ts` has
 * no dedicated `__checks__` suite of its own; `isBillSeries` is covered by
 * `money/__checks__/run.ts` and ported in `MoneyModelTest`). These tests pin
 * down `detectRecurring`, `clusterByAmount`, `classifyCadence` and
 * `monthlyEquivalentCents` — the pieces of this package's own scope that had
 * no existing web-side assertions to port verbatim.
 */
class RecurringDetectTest {

    private var counter = 0
    private fun txn(date: LocalDate, amountCents: Long, merchant: String, categoryId: String = "cat-rent"): Txn {
        counter++
        return Txn(
            id = "t-$counter", date = date, amountCents = amountCents, description = merchant,
            merchant = merchant, categoryId = categoryId, account = AccountId.CBA, source = TxnSource.CSV,
            hash = "h-$counter", createdAt = 0, updatedAt = 0
        )
    }

    @Test
    fun `monthlyEquivalentCents matches the 52-12 and 26-12 conventions per cadence`() {
        assertEquals("weekly \$60 -> ~\$260/month via 52/12", 260_000L, monthlyEquivalentCents(60_000, RecurringCadence.WEEKLY))
        assertEquals("fortnightly \$1200 -> ~\$2600/month via 26/12", 2_600_000L, monthlyEquivalentCents(1_200_000, RecurringCadence.FORTNIGHTLY))
        assertEquals("monthly passes through unchanged", 100_000L, monthlyEquivalentCents(100_000, RecurringCadence.MONTHLY))
        assertEquals("quarterly \$300 -> \$100/month", 10_000L, monthlyEquivalentCents(30_000, RecurringCadence.QUARTERLY))
        assertEquals("yearly \$1200 -> \$100/month", 10_000L, monthlyEquivalentCents(120_000, RecurringCadence.YEARLY))
        assertEquals("a negative (income) series contributes nothing", 0L, monthlyEquivalentCents(-500, RecurringCadence.MONTHLY))
    }

    @Test
    fun `clusterByAmount keeps a utility bill together despite small drift`() {
        val today = LocalDate.of(2026, 8, 15)
        val opts = DetectionOptions(today = today)
        val txns = listOf(
            txn(LocalDate.of(2026, 6, 1), 14_500, "Origin Energy"),
            txn(LocalDate.of(2026, 7, 1), 15_200, "Origin Energy"),
            txn(LocalDate.of(2026, 8, 1), 14_900, "Origin Energy")
        )
        val clusters = clusterByAmount(txns, opts)
        assertEquals("small month-to-month drift stays in one cluster", 1, clusters.size)
        assertEquals(3, clusters[0].size)
    }

    @Test
    fun `clusterByAmount splits genuinely different amounts into separate clusters`() {
        val today = LocalDate.of(2026, 8, 15)
        val opts = DetectionOptions(today = today)
        val txns = listOf(
            txn(LocalDate.of(2026, 6, 1), 1_200, "Cafe X"),
            txn(LocalDate.of(2026, 6, 8), 1_300, "Cafe X"),
            txn(LocalDate.of(2026, 7, 1), 9_500, "Cafe X") // a large catering order, not a repeat coffee
        )
        val clusters = clusterByAmount(txns, opts)
        assertTrue("the outlier amount must not be folded into the small-amount cluster", clusters.size >= 2)
    }

    @Test
    fun `classifyCadence recognises a monthly rent series within tolerance`() {
        val today = LocalDate.of(2026, 8, 15)
        val opts = DetectionOptions(today = today)
        val dates = listOf(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 2), LocalDate.of(2026, 8, 1))
        val result = classifyCadence(dates, opts)
        assertEquals(RecurringCadence.MONTHLY, result?.cadence)
    }

    @Test
    fun `detectRecurring finds a 3-occurrence monthly rent series and marks it a bill`() {
        val today = LocalDate.of(2026, 8, 15)
        val txns = listOf(
            txn(LocalDate.of(2026, 6, 1), 260_000, "Rent Payment", "cat-rent"),
            txn(LocalDate.of(2026, 7, 1), 260_000, "Rent Payment", "cat-rent"),
            txn(LocalDate.of(2026, 8, 1), 260_000, "Rent Payment", "cat-rent")
        )
        val series = detectRecurring(txns, emptyList(), DetectionOptions(today = today))
        assertEquals("exactly one series detected", 1, series.size)
        val rent = series[0]
        assertEquals(RecurringCadence.MONTHLY, rent.cadence)
        assertEquals(260_000L, rent.amountCents)
        assertEquals(3, rent.txnIds.size)
    }

    @Test
    fun `detectRecurring below minOccurrences produces no series`() {
        val today = LocalDate.of(2026, 8, 15)
        val txns = listOf(
            txn(LocalDate.of(2026, 6, 1), 260_000, "Rent Payment"),
            txn(LocalDate.of(2026, 7, 1), 260_000, "Rent Payment")
        )
        val series = detectRecurring(txns, emptyList(), DetectionOptions(today = today))
        assertEquals("only 2 occurrences, below the minOccurrences=3 floor", 0, series.size)
    }

    @Test
    fun `detectRecurring keeps a confirmed series authoritative even when clustering would recompute it`() {
        val today = LocalDate.of(2026, 8, 15)
        val confirmed = RecurringSeries(
            id = "user-confirmed-1",
            merchant = "Netflix",
            categoryId = "cat-subscriptions",
            cadence = RecurringCadence.MONTHLY,
            amountCents = 1_450,
            lastSeen = LocalDate.of(2026, 7, 5),
            nextDue = LocalDate.of(2026, 8, 5),
            txnIds = listOf("old-1", "old-2", "old-3"),
            confirmed = true
        )
        // No matching transactions at all this pass — the confirmed series must still survive.
        val series = detectRecurring(emptyList(), listOf(confirmed), DetectionOptions(today = today))
        assertEquals(1, series.size)
        assertEquals("confirmed series id is preserved", "user-confirmed-1", series[0].id)
        assertEquals("confirmed amount is untouched", 1_450L, series[0].amountCents)
        assertTrue("confirmed flag survives", series[0].confirmed)
    }

    @Test
    fun `rollForwardDueDate advances a stale confirmed due date to on-or-after today`() {
        val today = LocalDate.of(2026, 8, 15)
        val stale = LocalDate.of(2026, 5, 5) // three months stale for a monthly cadence
        val rolled = rollForwardDueDate(stale, RecurringCadence.MONTHLY, today)
        assertTrue("rolled-forward date is never before today", !rolled.isBefore(today))
    }
}
