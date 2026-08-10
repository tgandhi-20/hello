package com.tally.app.ui.budgets

import com.tally.app.personal.CATEGORY_IDS
import com.tally.app.ui.model.CategoryKind
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiCategorySpend
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * These target the pure functions in `BudgetsScreen.kt` directly — no Compose
 * involved, so they run on the host JVM like every other agent's `src/test/`
 * suite (there is no Compose UI testing dependency in this build, per
 * `app/build.gradle.kts`).
 */
class BudgetsScreenTest {

    @Test
    fun `buildBudgetEntries pulls the cap from the personal plan and the spend from byCategory, never summing itself`() {
        val categories = listOf(
            UiCategory(id = CATEGORY_IDS.groceries, label = "Groceries", colorIndex = 4, kind = CategoryKind.NEED),
        )
        val byCategory = listOf(
            UiCategorySpend(categoryId = CATEGORY_IDS.groceries, label = "Groceries", colorIndex = 4, spentCents = 12000L),
        )
        val entries = buildBudgetEntries(listOf(CATEGORY_IDS.groceries), categories, byCategory)
        assertEquals(1, entries.size)
        assertEquals(37000L, entries[0].capCents) // $370 cap, from com.tally.app.personal, not invented here
        assertEquals(12000L, entries[0].spentCents)
        assertEquals(4, entries[0].colorIndex)
    }

    @Test
    fun `a category absent from byCategory defaults to zero spend, not a crash or an invented figure`() {
        val entries = buildBudgetEntries(listOf(CATEGORY_IDS.coffee), emptyList(), emptyList())
        assertEquals(1, entries.size)
        assertEquals(0L, entries[0].spentCents)
        assertEquals(6000L, entries[0].capCents) // $60 cap
    }

    @Test
    fun `a category missing from the vault's own list still gets the personal plan's label, not a raw id`() {
        val entries = buildBudgetEntries(listOf(CATEGORY_IDS.skincare), emptyList(), emptyList())
        assertEquals("Skincare", entries[0].label)
    }

    @Test
    fun `budgetProgressFraction is clamped to 1 even when spend is far over cap`() {
        val entry = BudgetEntry("x", "X", 0, capCents = 10000L, spentCents = 50000L)
        assertEquals(1f, budgetProgressFraction(entry), 0.0001f)
    }

    @Test
    fun `budgetProgressFraction is exactly proportional under cap`() {
        val entry = BudgetEntry("x", "X", 0, capCents = 10000L, spentCents = 2500L)
        assertEquals(0.25f, budgetProgressFraction(entry), 0.0001f)
    }

    @Test
    fun `a null or non-positive cap never divides — fraction is zero, not NaN or a crash`() {
        assertEquals(0f, budgetProgressFraction(BudgetEntry("x", "X", 0, capCents = null, spentCents = 500L)), 0.0001f)
        assertEquals(0f, budgetProgressFraction(BudgetEntry("x", "X", 0, capCents = 0L, spentCents = 500L)), 0.0001f)
        // Sublet's cap is negative (it is recurring income offsetting rent, not a spend
        // cap) — this must never read as "used" in the ordinary sense.
        assertEquals(0f, budgetProgressFraction(BudgetEntry("x", "X", 0, capCents = -151700L, spentCents = 0L)), 0.0001f)
    }

    @Test
    fun `isOverBudget is true only once spend exceeds a positive cap`() {
        assertFalse(isOverBudget(BudgetEntry("x", "X", 0, capCents = 10000L, spentCents = 9999L)))
        assertFalse(isOverBudget(BudgetEntry("x", "X", 0, capCents = 10000L, spentCents = 10000L)))
        assertTrue(isOverBudget(BudgetEntry("x", "X", 0, capCents = 10000L, spentCents = 10001L)))
        assertFalse("a null cap is never over budget", isOverBudget(BudgetEntry("x", "X", 0, capCents = null, spentCents = 999999L)))
        assertFalse("sublet's negative cap is never over budget", isOverBudget(BudgetEntry("x", "X", 0, capCents = -151700L, spentCents = 500L)))
    }

    @Test
    fun `every category id this screen displays has a defined cap, per the personal plan`() {
        val ids = listOf(
            CATEGORY_IDS.rent, CATEGORY_IDS.sublet, CATEGORY_IDS.utilities, CATEGORY_IDS.family,
            CATEGORY_IDS.groceries, CATEGORY_IDS.transport, CATEGORY_IDS.eatingOut, CATEGORY_IDS.lunch,
            CATEGORY_IDS.coffee, CATEGORY_IDS.health, CATEGORY_IDS.phone, CATEGORY_IDS.shopping,
            CATEGORY_IDS.subscriptions, CATEGORY_IDS.skincare,
        )
        val entries = buildBudgetEntries(ids, emptyList(), emptyList())
        entries.forEach { assertTrue("${it.categoryId} must have a cap", it.capCents != null) }
    }

    @Test
    fun `savings and uncapped categories are never asked for here — categoryCapCents returns null for them`() {
        val entries = buildBudgetEntries(
            listOf(CATEGORY_IDS.income, CATEGORY_IDS.oneOff, CATEGORY_IDS.other),
            emptyList(),
            emptyList(),
        )
        entries.forEach { assertNull(it.capCents) }
    }
}
