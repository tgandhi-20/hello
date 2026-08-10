package com.tally.app.ui.data

import com.tally.app.money.AccountId
import com.tally.app.money.BillDueSoonCertainty
import com.tally.app.money.BillDueSoonItem
import com.tally.app.money.BillDueSoonKind
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import com.tally.app.money.MonthMoney
import com.tally.app.money.MonthMoneyCategoryRow
import com.tally.app.money.MonthMoneyFoodThisWeek
import com.tally.app.money.MonthMoneySavingsProgress
import com.tally.app.money.ToSortOutItem
import com.tally.app.money.ToSortOutKind
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.ui.model.CategoryKind as UiCategoryKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

/**
 * These target the pure mapping functions in `VaultTallyDataSource.kt`
 * directly — no `VaultRepository`/Android `Context` involved, so they run
 * on the host JVM exactly like every other agent's `src/test/` suite.
 */
class VaultTallyDataSourceMappingTest {

    @Test
    fun `cat-n tokens map to a zero-based index`() {
        assertEquals(2, colorTokenToIndex("cat-3"))
        assertEquals(0, colorTokenToIndex("cat-1"))
        assertEquals(11, colorTokenToIndex("cat-12"))
    }

    @Test
    fun `an unresolved token (ink-3) falls back to a stable, non-negative index instead of crashing`() {
        val first = colorTokenToIndex("ink-3")
        val second = colorTokenToIndex("ink-3")
        assertEquals("must be stable across calls, not random", first, second)
        assertTrue(first >= 0)
    }

    @Test
    fun `garbage or empty tokens never crash and stay stable`() {
        assertEquals(colorTokenToIndex(""), colorTokenToIndex(""))
        assertTrue(colorTokenToIndex("") >= 0)
        // n < 1 (e.g. "cat-0", which should never occur but must not crash
        // or go negative) falls through to the same hash fallback.
        assertTrue(colorTokenToIndex("cat-0") >= 0)
        assertTrue(colorTokenToIndex("not-a-token-at-all") >= 0)
    }

    @Test
    fun `toUiCategorySpend carries the mapped color index and amount through unchanged`() {
        val row = MonthMoneyCategoryRow(categoryId = "groceries", label = "Groceries", colorToken = "cat-5", spentCents = 4200L)
        val ui = toUiCategorySpend(row)
        assertEquals("groceries", ui.categoryId)
        assertEquals("Groceries", ui.label)
        assertEquals(4, ui.colorIndex)
        assertEquals(4200L, ui.spentCents)
    }

    @Test
    fun `toUiMonthMoney is a straight field-for-field copy, never a recomputation`() {
        val money = sampleMonthMoney()
        val ui = toUiMonthMoney(money)
        assertEquals(money.incomeUnset, ui.incomeUnset)
        assertEquals(money.incomeCents, ui.incomeCents)
        assertEquals(money.billsCents, ui.billsCents)
        assertEquals(money.savingsCents, ui.savingsCents)
        assertEquals(money.toSpendCents, ui.toSpendCents)
        assertEquals(money.spentCents, ui.spentCents)
        assertEquals(money.leftCents, ui.leftCents)
        assertEquals(money.daysRemaining, ui.daysRemaining)
        assertEquals(money.leftTodayCents, ui.leftTodayCents)
        assertEquals(money.byCategory.size, ui.byCategory.size)
        assertEquals(money.byCategory.first().spentCents, ui.byCategory.first().spentCents)
    }

    @Test
    fun `toUiDepositPlan mirrors monthMoney's own savingsProgress line, never a second figure`() {
        val money = sampleMonthMoney()
        val plan = toUiDepositPlan(money)
        assertEquals(money.savingsProgress.actualBalanceCents, plan.actualBalanceCents)
        assertEquals(money.savingsProgress.goalTargetCents, plan.goalTargetCents)
        assertEquals(money.savingsProgress.onTrack, plan.onTrack)
        assertEquals(money.savingsProgress.behindCents, plan.behindCents)
        assertEquals(money.savingsProgress.daysUntilTarget, plan.daysLeft)
    }

    @Test
    fun `a null MonthMoney (not yet hydrated) produces an honest all-zero deposit plan, not a crash`() {
        val plan = toUiDepositPlan(null)
        assertEquals(0L, plan.actualBalanceCents)
        assertEquals(0L, plan.goalTargetCents)
        assertEquals(0L, plan.behindCents)
        assertEquals(0, plan.daysLeft)
        assertTrue(plan.onTrack)
    }

    @Test
    fun `toUiCategory never invents a typical amount`() {
        val category = Category(
            id = "coffee",
            label = "Coffee",
            icon = "coffee",
            colorToken = "cat-4",
            kind = CategoryKind.WANT,
            builtin = true,
            order = 4,
        )
        val ui = toUiCategory(category)
        assertEquals("coffee", ui.id)
        assertEquals(3, ui.colorIndex)
        assertEquals(UiCategoryKind.WANT, ui.kind)
        assertNull("no suggested-amount engine exists yet — must stay null, never a guess", ui.typicalAmountCents)
    }

    @Test
    fun `toUiTxn preserves sign (positive spend, negative income) and every field`() {
        val txn = Txn(
            id = "t1",
            date = LocalDate.of(2026, 8, 1),
            amountCents = -50000L,
            description = "Pay",
            merchant = "Employer",
            categoryId = "income",
            account = AccountId.CBA,
            source = TxnSource.CSV,
            hash = "h",
            note = "note",
        )
        val ui = toUiTxn(txn)
        assertEquals("t1", ui.id)
        assertEquals(LocalDate.of(2026, 8, 1), ui.date)
        assertEquals(-50000L, ui.amountCents)
        assertEquals("Employer", ui.merchant)
        assertEquals("income", ui.categoryId)
        assertEquals("note", ui.note)
    }

    @Test
    fun `toUiBillDueSoon carries date, label and signed amount through, and collapses certainty to a boolean`() {
        val scheduled = BillDueSoonItem(
            id = "salary-2026-08-15",
            date = LocalDate.of(2026, 8, 15),
            kind = BillDueSoonKind.INCOME,
            label = "Salary",
            amountCents = -645700L,
            certainty = BillDueSoonCertainty.SCHEDULED,
        )
        val predicted = BillDueSoonItem(
            id = "rec-1::2026-08-20",
            date = LocalDate.of(2026, 8, 20),
            kind = BillDueSoonKind.RECURRING,
            label = "Netflix",
            amountCents = 1699L,
            certainty = BillDueSoonCertainty.PREDICTED,
        )
        val uiScheduled = toUiBillDueSoon(scheduled)
        assertEquals("salary-2026-08-15", uiScheduled.id)
        assertEquals(LocalDate.of(2026, 8, 15), uiScheduled.date)
        assertEquals("Salary", uiScheduled.label)
        assertEquals(-645700L, uiScheduled.amountCents)
        assertEquals(false, uiScheduled.predicted)

        val uiPredicted = toUiBillDueSoon(predicted)
        assertEquals(1699L, uiPredicted.amountCents)
        assertEquals(true, uiPredicted.predicted)
    }

    @Test
    fun `toUiToSortOutItem drops kind and the route, keeping id, title, subtitle and amount`() {
        val item = ToSortOutItem(
            id = "price-rise-rec-1",
            kind = ToSortOutKind.PRICE_RISE,
            title = "Netflix went up",
            subtitle = "Detected price rise on a regular payment",
            amountCents = 200L,
            to = "/recurring",
        )
        val ui = toUiToSortOutItem(item)
        assertEquals("price-rise-rec-1", ui.id)
        assertEquals("Netflix went up", ui.title)
        assertEquals("Detected price rise on a regular payment", ui.subtitle)
        assertEquals(200L, ui.amountCents)
    }

    @Test
    fun `toUiToSortOutItem preserves a null amount for kinds with no figure to show`() {
        val item = ToSortOutItem(
            id = "uncategorised",
            kind = ToSortOutKind.UNCATEGORISED,
            title = "2 transactions need a category",
            subtitle = "From an import - a quick pass keeps this trustworthy",
            to = "/transactions",
        )
        assertNull(toUiToSortOutItem(item).amountCents)
    }

    private fun sampleMonthMoney(): MonthMoney {
        val today = LocalDate.of(2026, 8, 10)
        val month = YearMonth.from(today)
        val food = MonthMoneyFoodThisWeek(
            weekStart = today.minusDays(2),
            weekEnd = today.plusDays(4),
            daysLeft = 5,
            targetCents = 14100L,
            spentCents = 3000L,
            remainingCents = 11100L,
            groceriesCents = 2000L,
            awayCents = 1000L,
        )
        val savings = MonthMoneySavingsProgress(
            monthlyTargetCents = 35000L,
            goalTargetCents = 7233900L,
            goalTargetDate = LocalDate.of(2027, 12, 31),
            projectedBalanceCents = 4200000L,
            actualBalanceCents = 4100000L,
            isBalanceUserEntered = true,
            behindCents = 100000L,
            onTrack = false,
            daysUntilTarget = 500,
        )
        return MonthMoney(
            month = month,
            today = today,
            incomeUnset = false,
            incomeCents = 645700L,
            billsCents = 129300L,
            savingsCents = 350000L,
            toSpendCents = 166400L,
            spentCents = 86400L,
            leftCents = 80000L,
            daysRemaining = 21,
            leftTodayCents = 3809L,
            daysLeftInWeek = 5,
            leftThisWeekCents = 19045L,
            byCategory = listOf(
                MonthMoneyCategoryRow("groceries", "Groceries", "cat-1", 13000L),
            ),
            foodThisWeek = food,
            savingsProgress = savings,
        )
    }
}
