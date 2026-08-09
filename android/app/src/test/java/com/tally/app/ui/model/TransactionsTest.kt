package com.tally.app.ui.model

import org.junit.Assert.assertEquals
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
}
