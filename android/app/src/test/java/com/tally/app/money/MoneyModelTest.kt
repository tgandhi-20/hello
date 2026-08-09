package com.tally.app.money

import com.tally.app.recurring.monthlyEquivalentCents
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

/**
 * JUnit port of src/money/__checks__/run.ts — the one money model
 * (DESIGN-V4.md §1). Every `eq`/`check`/`finite` assertion in that file has a
 * direct counterpart here, same fixtures, same expected values, same section
 * numbering in the comments so the two can be diffed by eye.
 */
class MoneyModelTest {

    private var txnCounter = 0

    private fun mkTxn(
        date: LocalDate,
        amountCents: Cents,
        categoryId: String,
        id: String? = null,
        excluded: Boolean = false
    ): Txn {
        txnCounter++
        return Txn(
            id = id ?: "txn-$txnCounter",
            date = date,
            amountCents = amountCents,
            description = "fixture",
            merchant = "fixture",
            categoryId = categoryId,
            account = AccountId.CASH,
            source = TxnSource.MANUAL,
            hash = "hash-$txnCounter",
            excluded = excluded,
            createdAt = 0,
            updatedAt = 0
        )
    }

    private fun mkSettings(monthlyIncomeCents: Cents = 0, savingsTargetCents: Cents = 0): Settings =
        Settings(monthlyIncomeCents = monthlyIncomeCents, savingsTargetCents = savingsTargetCents)

    private fun mkSeries(
        id: String,
        nextDue: LocalDate,
        amountCents: Cents = 100_000,
        cadence: RecurringCadence = RecurringCadence.MONTHLY,
        txnIds: List<String> = emptyList(),
        muted: Boolean = false
    ): RecurringSeries = RecurringSeries(
        id = id,
        merchant = "Merchant",
        categoryId = "cat-rent",
        cadence = cadence,
        amountCents = amountCents,
        lastSeen = nextDue,
        nextDue = nextDue,
        txnIds = txnIds,
        muted = muted
    )

    private val CATEGORIES = listOf(
        Category("cat-rent", "Rent", "Home", "cat-1", CategoryKind.NEED, true, 0),
        Category("cat-groceries", "Groceries", "ShoppingCart", "cat-2", CategoryKind.NEED, true, 1),
        Category("cat-eating-out", "Eating out", "Utensils", "cat-3", CategoryKind.WANT, true, 2),
        Category("cat-lunch", "Lunch", "Sandwich", "cat-4", CategoryKind.WANT, true, 3),
        Category("cat-coffee", "Coffee", "Coffee", "cat-5", CategoryKind.WANT, true, 4),
        Category("cat-shopping", "Shopping", "Bag", "cat-6", CategoryKind.WANT, true, 5)
    )

    private fun compute(
        txns: List<Txn>,
        recurring: List<RecurringSeries>,
        settings: Settings,
        categories: List<Category> = CATEGORIES,
        month: YearMonth,
        today: LocalDate
    ): MonthMoney = computeMonthMoney(ComputeMonthMoneyParams(txns, recurring, settings, categories, month, today))

    // =======================================================================
    // 1. The equation balances: income - bills - savings - spent === left,
    //    across several scenarios (income set, income unset, over-committed).
    // =======================================================================
    @Test
    fun `1 - equation balances across scenarios`() {
        val month = YearMonth.of(2026, 8)
        val today = LocalDate.of(2026, 8, 10)

        data class Scenario(val name: String, val settings: Settings, val recurring: List<RecurringSeries>, val txns: List<Txn>)

        val scenarios = listOf(
            Scenario(
                "a typical month",
                mkSettings(645_700, 350_000),
                listOf(mkSeries("rent", LocalDate.of(2026, 8, 1), 129_300, RecurringCadence.MONTHLY, listOf("r1"))),
                listOf(
                    mkTxn(LocalDate.of(2026, 8, 1), 129_300, "cat-rent", id = "r1"),
                    mkTxn(LocalDate.of(2026, 8, 5), 5_000, "cat-groceries")
                )
            ),
            Scenario(
                "income unset",
                mkSettings(0, 350_000),
                emptyList(),
                listOf(mkTxn(LocalDate.of(2026, 8, 5), 5_000, "cat-groceries"))
            ),
            Scenario(
                "no recurring detected",
                mkSettings(645_700, 350_000),
                emptyList(),
                listOf(mkTxn(LocalDate.of(2026, 8, 5), 5_000, "cat-groceries"))
            ),
            Scenario(
                "over-committed (bills + savings exceed income)",
                mkSettings(100_000, 350_000),
                listOf(mkSeries("rent2", LocalDate.of(2026, 8, 1), 200_000, RecurringCadence.MONTHLY)),
                emptyList()
            ),
            Scenario(
                "zero transactions",
                mkSettings(645_700, 350_000),
                emptyList(),
                emptyList()
            )
        )

        for (s in scenarios) {
            val m = compute(s.txns, s.recurring, s.settings, month = month, today = today)
            assertEquals(
                "Equation balances (${s.name}): income - bills - savings - spent === left",
                m.leftCents,
                m.incomeCents - m.billsCents - m.savingsCents - m.spentCents
            )
            assertEquals(
                "toSpend === income - bills - savings (${s.name})",
                m.incomeCents - m.billsCents - m.savingsCents,
                m.toSpendCents
            )
            assertEquals("left === toSpend - spent (${s.name})", m.toSpendCents - m.spentCents, m.leftCents)
        }
    }

    // =======================================================================
    // 2. byCategory sums exactly to spentCents.
    // =======================================================================
    @Test
    fun `2 - byCategory sums exactly to spentCents`() {
        val txns = listOf(
            mkTxn(LocalDate.of(2026, 8, 2), 5_000, "cat-groceries"),
            mkTxn(LocalDate.of(2026, 8, 3), 3_000, "cat-eating-out"),
            mkTxn(LocalDate.of(2026, 8, 4), 1_500, "cat-lunch"),
            mkTxn(LocalDate.of(2026, 8, 5), 500, "cat-coffee"),
            mkTxn(LocalDate.of(2026, 8, 6), 7_500, "cat-shopping")
        )
        val m = compute(
            txns, emptyList(), mkSettings(645_700, 0),
            month = YearMonth.of(2026, 8), today = LocalDate.of(2026, 8, 10)
        )
        val byCategorySum = m.byCategory.sumOf { it.spentCents }
        assertEquals("byCategory sums exactly to spentCents", m.spentCents, byCategorySum)
        assertEquals("byCategory has one row per distinct category", 5, m.byCategory.size)
        assertTrue(
            "byCategory is sorted largest first",
            m.byCategory.indices.all { i -> i == 0 || m.byCategory[i - 1].spentCents >= m.byCategory[i].spentCents }
        )
    }

    // =======================================================================
    // 3. Committed recurring spend is counted exactly ONCE — the old
    //    double-count regression (previously fixed in safeToSpend.ts).
    // =======================================================================
    @Test
    fun `3 - committed recurring spend counted exactly once`() {
        val rentTxn = mkTxn(LocalDate.of(2026, 8, 1), 129_300, "cat-rent", id = "rent-txn")
        val groceriesTxn = mkTxn(LocalDate.of(2026, 8, 5), 5_000, "cat-groceries")
        val settings = mkSettings(645_700, 0)
        val month = YearMonth.of(2026, 8)
        val today = LocalDate.of(2026, 8, 10)

        val activeSeries = listOf(
            mkSeries("rent-series", LocalDate.of(2026, 9, 1), 129_300, RecurringCadence.MONTHLY, listOf(rentTxn.id))
        )
        val m = compute(listOf(rentTxn, groceriesTxn), activeSeries, settings, month = month, today = today)

        assertEquals("billsCents counts the rent series once", 129_300L, m.billsCents)
        assertEquals("spentCents excludes the committed rent txn (only groceries remains)", 5_000L, m.spentCents)
        assertNull(
            "The rent txn never appears in byCategory once its series is active",
            m.byCategory.find { it.categoryId == "cat-rent" }
        )
        assertEquals(
            "income - bills - savings - spent === left even with a committed txn present",
            m.leftCents,
            m.incomeCents - m.billsCents - m.savingsCents - m.spentCents
        )

        // Muting the series must make its transaction fall through into ordinary spend —
        // counted exactly once, never zero times.
        val mutedSeries = listOf(
            mkSeries("rent-series", LocalDate.of(2026, 9, 1), 129_300, RecurringCadence.MONTHLY, listOf(rentTxn.id), muted = true)
        )
        val mMuted = compute(listOf(rentTxn, groceriesTxn), mutedSeries, settings, month = month, today = today)
        assertEquals("A muted series contributes nothing to billsCents", 0L, mMuted.billsCents)
        assertEquals("A muted series' txn falls through into spentCents", 129_300L + 5_000L, mMuted.spentCents)
    }

    // =======================================================================
    // 4. leftTodayCents x daysLeftInWeek === leftThisWeekCents, always.
    // =======================================================================
    @Test
    fun `4 - leftToday times daysLeftInWeek equals leftThisWeek`() {
        val month = YearMonth.of(2026, 8)
        for (today in listOf(LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 5), LocalDate.of(2026, 8, 9), LocalDate.of(2026, 8, 31))) {
            val m = compute(emptyList(), emptyList(), mkSettings(645_700, 350_000), month = month, today = today)
            assertEquals(
                "leftToday x daysLeftInWeek === leftThisWeek (today=$today)",
                m.leftThisWeekCents,
                m.leftTodayCents * m.daysLeftInWeek
            )
            assertTrue("daysLeftInWeek is 1..7 (today=$today)", m.daysLeftInWeek in 1..7)
        }
    }

    // =======================================================================
    // 5. Zero-income, zero-txn, last-day-of-month and empty-recurring cases
    //    all return finite numbers — nothing may ever be NaN/Infinity. (Cents
    //    are Long here, so "finite" is trivially true by type — these checks
    //    instead pin the actual guarded values the TS source asserts.)
    // =======================================================================
    @Test
    fun `5 - zero-income zero-txn edge cases are all guarded`() {
        val zeroEverything = compute(
            emptyList(), emptyList(), mkSettings(), categories = emptyList(),
            month = YearMonth.of(2026, 8), today = LocalDate.of(2026, 8, 10)
        )
        assertTrue("Zero-income, zero-txn: incomeUnset is true", zeroEverything.incomeUnset)
        assertEquals("Zero-income, zero-txn: byCategory is empty", 0, zeroEverything.byCategory.size)

        // A past month: daysRemaining collapses to 0 — leftToday/leftThisWeek must still
        // guard the division rather than divide by zero.
        val pastMonth = compute(
            emptyList(), emptyList(), mkSettings(645_700, 350_000),
            month = YearMonth.of(2026, 1), today = LocalDate.of(2026, 8, 10)
        )
        assertEquals("Past month: daysRemaining is 0", 0, pastMonth.daysRemaining)
        assertEquals("Past month: leftToday is guarded to 0, not a divide-by-zero", 0L, pastMonth.leftTodayCents)

        // A future month.
        val futureMonth = compute(
            emptyList(), emptyList(), mkSettings(645_700, 350_000),
            month = YearMonth.of(2027, 3), today = LocalDate.of(2026, 8, 10)
        )
        assertTrue("Future month: daysRemaining is the full month length", futureMonth.daysRemaining == 31)

        // The last day of the month: daysRemaining must be exactly 1, never 0.
        val lastDay = compute(
            emptyList(), emptyList(), mkSettings(645_700, 350_000),
            month = YearMonth.of(2026, 8), today = LocalDate.of(2026, 8, 31)
        )
        assertEquals("Last day of month: daysRemaining === 1", 1, lastDay.daysRemaining)
    }

    // =======================================================================
    // 6. Food-this-week agrees with the same categories the breakdown uses.
    // =======================================================================
    @Test
    fun `6 - foodThisWeek agrees with byCategory over the same 4 category ids`() {
        // Wednesday 5 Aug 2026 -> week is Mon 3 Aug .. Sun 9 Aug, fully inside August.
        val today = LocalDate.of(2026, 8, 5)
        val txns = listOf(
            mkTxn(LocalDate.of(2026, 8, 4), 5_000, "cat-groceries"),
            mkTxn(LocalDate.of(2026, 8, 4), 3_000, "cat-eating-out"),
            mkTxn(LocalDate.of(2026, 8, 5), 1_500, "cat-lunch"),
            mkTxn(LocalDate.of(2026, 8, 5), 500, "cat-coffee"),
            mkTxn(LocalDate.of(2026, 8, 6), 999_900, "cat-rent") // must not leak in
        )
        val m = compute(txns, emptyList(), mkSettings(645_700, 0), month = YearMonth.of(2026, 8), today = today)

        val foodIds = setOf("cat-groceries", "cat-eating-out", "cat-lunch", "cat-coffee")
        val byCategoryFoodSum = m.byCategory.filter { it.categoryId in foodIds }.sumOf { it.spentCents }

        assertEquals("foodThisWeek.spentCents agrees with the same 4 category ids summed in byCategory", byCategoryFoodSum, m.foodThisWeek.spentCents)
        assertEquals("foodThisWeek.spentCents === 5000+3000+1500+500", 10_000L, m.foodThisWeek.spentCents)
        assertEquals("foodThisWeek target is the frozen \$141/week headline", 14_100L, m.foodThisWeek.targetCents)
        assertEquals("foodThisWeek groceries bucket", 5_000L, m.foodThisWeek.groceriesCents)
        assertEquals("foodThisWeek away bucket (eating-out + lunch + coffee)", 3_000L + 1_500L + 500L, m.foodThisWeek.awayCents)
    }

    // =======================================================================
    // 7. Bills are commitments, not just anything that repeats.
    // =======================================================================
    @Test
    fun `7 - isBillSeries and activeRecurringTxnIds`() {
        val weeklyHabit = RecurringSeries(
            id = "weekly-lunch", merchant = "Lunch Spot", categoryId = "cat-lunch",
            cadence = RecurringCadence.WEEKLY, amountCents = 1_800,
            lastSeen = LocalDate.of(2026, 8, 4), nextDue = LocalDate.of(2026, 8, 11),
            txnIds = listOf("lunch-1")
        )
        val monthlyRent = RecurringSeries(
            id = "rent", merchant = "Rent", categoryId = "cat-rent",
            cadence = RecurringCadence.MONTHLY, amountCents = 260_000,
            lastSeen = LocalDate.of(2026, 7, 1), nextDue = LocalDate.of(2026, 8, 1),
            txnIds = listOf("rent-1")
        )

        assertTrue("a weekly habit is not a bill", !isBillSeries(weeklyHabit))
        assertTrue("a monthly commitment is a bill", isBillSeries(monthlyRent))
        assertTrue("confirming a weekly series promotes it to a bill", isBillSeries(weeklyHabit.copy(confirmed = true)))
        assertTrue("a muted monthly series is not a bill", !isBillSeries(monthlyRent.copy(muted = true)))

        val ids = activeRecurringTxnIds(listOf(weeklyHabit, monthlyRent))
        assertTrue("a non-bill series does not hide its transactions from spend", !ids.contains("lunch-1"))
        assertTrue("a bill series does hide its transactions from spend", ids.contains("rent-1"))
    }

    // =======================================================================
    // Bonus (not in the original 41): monthlyEquivalentCents' per-cadence math,
    // since computeMonthMoney's billsCents leans on it directly.
    // =======================================================================
    @Test
    fun `bonus - monthlyEquivalentCents matches the 52-12 convention, never x4`() {
        assertEquals(260_000L, monthlyEquivalentCents(60_000, RecurringCadence.WEEKLY))
        assertTrue("weekly x4 would be wrong", monthlyEquivalentCents(60_000, RecurringCadence.WEEKLY) != 60_000L * 4)
        assertEquals(100_000L, monthlyEquivalentCents(100_000, RecurringCadence.MONTHLY))
        assertEquals(0L, monthlyEquivalentCents(-500, RecurringCadence.MONTHLY)) // negative (income) series contributes nothing
    }
}
