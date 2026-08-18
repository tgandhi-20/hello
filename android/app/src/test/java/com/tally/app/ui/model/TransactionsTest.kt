package com.tally.app.ui.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

class TransactionsTest {

    private fun txn(id: String, date: LocalDate, cents: Long, merchant: String = "Merchant", note: String? = null) =
        UiTxn(id = id, date = date, amountCents = cents, merchant = merchant, categoryId = "cat", note = note)

    @Test
    fun groupsByDayWithCorrectSubtotals() {
        val day1 = LocalDate.of(2026, 8, 9)
        val day2 = LocalDate.of(2026, 8, 8)
        val txns = listOf(
            txn("a", day1, 500L),
            txn("b", day1, 300L),
            txn("c", day2, 1_000L),
        )

        val groups = groupTxnsByDay(txns)

        assertEquals(2, groups.size)
        assertEquals(day1, groups[0].date) // newest day first
        assertEquals(800L, groups[0].subtotalCents)
        assertEquals(2, groups[0].txns.size)
        assertEquals(day2, groups[1].date)
        assertEquals(1_000L, groups[1].subtotalCents)
    }

    @Test
    fun groupingHandlesAnEmptyList() {
        assertTrue(groupTxnsByDay(emptyList()).isEmpty())
    }

    @Test
    fun filterMatchesMerchantOrNoteCaseInsensitively() {
        val txns = listOf(
            txn("a", LocalDate.now(), 100L, merchant = "Woolworths"),
            txn("b", LocalDate.now(), 200L, merchant = "Shell", note = "petrol for the woolies run"),
            txn("c", LocalDate.now(), 300L, merchant = "Kmart"),
        )

        val byMerchant = filterTxns(txns, "wool", null)
        assertEquals(setOf("a", "b"), byMerchant.map { it.id }.toSet())

        val byNote = filterTxns(txns, "PETROL", null)
        assertEquals(listOf("b"), byNote.map { it.id })

        val none = filterTxns(txns, "nonexistent", null)
        assertTrue(none.isEmpty())
    }

    @Test
    fun filterByMonthIsAndCombinedWithQuery() {
        val august = LocalDate.of(2026, 8, 15)
        val july = LocalDate.of(2026, 7, 15)
        val txns = listOf(
            txn("a", august, 100L, merchant = "Woolworths"),
            txn("b", july, 100L, merchant = "Woolworths"),
        )

        val result = filterTxns(txns, "", YearMonth.of(2026, 8))
        assertEquals(listOf("a"), result.map { it.id })
    }

    @Test
    fun relativeDayLabelsTodayAndYesterday() {
        val today = LocalDate.of(2026, 8, 9)
        assertEquals("Today", formatRelativeDay(today, today))
        assertEquals("Yesterday", formatRelativeDay(today.minusDays(1), today))
    }

    @Test
    fun relativeDayFallsBackToWeekdayAndDate() {
        val today = LocalDate.of(2026, 8, 9)
        val older = today.minusDays(6) // 3 Aug 2026 = a Monday
        val label = formatRelativeDay(older, today)
        assertTrue("expected a weekday + day + month label, got '$label'", label.contains("3"))
    }

    // -------------------------------------------------------------------
    // matchesTxnSearch — case/punctuation-insensitive search over merchant,
    // description, note and amount.
    // -------------------------------------------------------------------

    @Test
    fun `search matches merchant case-insensitively`() {
        val txn = txn("a", LocalDate.now(), 550L, merchant = "Campos Coffee")
        assertTrue(matchesTxnSearch(txn, "campos"))
        assertTrue(matchesTxnSearch(txn, "CAMPOS"))
        assertTrue(matchesTxnSearch(txn, "Coffee"))
        assertFalse(matchesTxnSearch(txn, "woolworths"))
    }

    @Test
    fun `search falls back to merchant when description is absent`() {
        val txn = txn("a", LocalDate.now(), 550L, merchant = "Campos Coffee")
        assertNull(txn.description)
        assertTrue(matchesTxnSearch(txn, "campos"))
    }

    @Test
    fun `search matches description when merchant does not contain the query`() {
        val txn = UiTxn(
            id = "a",
            date = LocalDate.now(),
            amountCents = 550L,
            merchant = "Campos Coffee",
            categoryId = "cat",
            description = "SQ *CAMPOS ROASTERY MELB",
        )
        assertTrue(matchesTxnSearch(txn, "roastery"))
    }

    @Test
    fun `search matches note`() {
        val txn = txn("a", LocalDate.now(), 550L, merchant = "Shell", note = "petrol for the road trip")
        assertTrue(matchesTxnSearch(txn, "road trip"))
    }

    @Test
    fun `an empty query matches everything`() {
        val txn = txn("a", LocalDate.now(), 550L, merchant = "Campos Coffee")
        assertTrue(matchesTxnSearch(txn, ""))
        assertTrue(matchesTxnSearch(txn, "   "))
    }

    @Test
    fun `search finds a transaction by its dollar amount`() {
        val txn = txn("a", LocalDate.now(), 2350L, merchant = "Campos Coffee")
        assertTrue(matchesTxnSearch(txn, "23.50"))
        assertTrue(matchesTxnSearch(txn, "\$23.50"))
        assertFalse(matchesTxnSearch(txn, "23.51"))
    }

    @Test
    fun `amount search ignores the sign — searching the figure finds income too`() {
        val income = txn("a", LocalDate.now(), -50000L, merchant = "Employer")
        assertTrue(matchesTxnSearch(income, "500.00"))
    }

    @Test
    fun `filterTxns still matches merchant or note case-insensitively through the shared predicate`() {
        val txns = listOf(
            txn("a", LocalDate.now(), 100L, merchant = "Woolworths"),
            txn("b", LocalDate.now(), 200L, merchant = "Shell", note = "petrol for the woolies run"),
            txn("c", LocalDate.now(), 300L, merchant = "Kmart"),
        )
        val byMerchant = filterTxns(txns, "wool", null)
        assertEquals(setOf("a", "b"), byMerchant.map { it.id }.toSet())
    }

    // -------------------------------------------------------------------
    // computeRunningBalances — pure, oldest -> newest cumulative balance.
    // -------------------------------------------------------------------

    @Test
    fun `running balance is the cumulative sum of spend-subtracts-income-adds, oldest to newest`() {
        val day1 = LocalDate.of(2026, 8, 1)
        val day2 = LocalDate.of(2026, 8, 2)
        val txns = listOf(
            txn("spend", day1, 2000L), // -2000
            txn("income", day2, -50000L), // +50000
        )
        val balances = computeRunningBalances(txns)
        assertEquals(-2000L, balances["spend"])
        assertEquals(48000L, balances["income"])
    }

    @Test
    fun `running balance is unaffected by the input list's own order`() {
        val day1 = LocalDate.of(2026, 8, 1)
        val day2 = LocalDate.of(2026, 8, 2)
        val newestFirst = listOf(
            txn("b", day2, 500L),
            txn("a", day1, 1000L),
        )
        val oldestFirst = listOf(
            txn("a", day1, 1000L),
            txn("b", day2, 500L),
        )
        assertEquals(computeRunningBalances(oldestFirst), computeRunningBalances(newestFirst))
        assertEquals(-1000L, computeRunningBalances(newestFirst)["a"])
        assertEquals(-1500L, computeRunningBalances(newestFirst)["b"])
    }

    @Test
    fun `same-day transactions keep the input list's relative order as the tie-break`() {
        val day = LocalDate.of(2026, 8, 1)
        val txns = listOf(
            txn("first", day, 300L),
            txn("second", day, 700L),
        )
        val balances = computeRunningBalances(txns)
        assertEquals(-300L, balances["first"])
        assertEquals(-1000L, balances["second"])
    }

    @Test
    fun `running balance of an empty list is an empty map`() {
        assertTrue(computeRunningBalances(emptyList()).isEmpty())
    }
}
