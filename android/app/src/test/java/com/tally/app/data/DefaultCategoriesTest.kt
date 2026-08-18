package com.tally.app.data

import com.tally.app.money.CategoryKind
import com.tally.app.personal.CATEGORY_IDS
import com.tally.app.personal.PERSONAL_CATEGORIES
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Without a seeded category set, a brand-new vault is unusable in a way that
 * never crashes and never shows an error: quick-add's category grid is
 * permanently empty (nothing to tap), every CSV-imported row categorises to
 * an empty `categoryId` instead of the real "Other" fallback, and
 * `buildToSortOut`'s "needs a category" nudge — which matches specifically
 * on `CATEGORY_IDS.other` — can never fire for it. `VaultRepository.setup`
 * seeds `buildDefaultCategories()` for exactly this reason; these tests pin
 * the pure builder's contract on the host JVM (`VaultRepository` itself
 * needs a real `Context`/Room and cannot run here — see that class's own
 * doc comment).
 */
class DefaultCategoriesTest {

    @Test
    fun `builds exactly one category per personal-plan entry, in order`() {
        val categories = buildDefaultCategories()
        assertEquals(PERSONAL_CATEGORIES.size, categories.size)
        assertEquals(PERSONAL_CATEGORIES.map { it.id }, categories.map { it.id })
    }

    @Test
    fun `every category is builtin with order matching its plan position`() {
        val categories = buildDefaultCategories()
        categories.forEachIndexed { index, category ->
            assertTrue("category ${category.id} should be builtin", category.builtin)
            assertEquals(index, category.order)
        }
    }

    @Test
    fun `plan kind strings map onto the money CategoryKind enum`() {
        val byId = buildDefaultCategories().associateBy { it.id }
        for (def in PERSONAL_CATEGORIES) {
            val expected = when (def.kind) {
                "need" -> CategoryKind.NEED
                "want" -> CategoryKind.WANT
                "save" -> CategoryKind.SAVE
                else -> error("unexpected plan kind '${def.kind}' for ${def.id}")
            }
            assertEquals(expected, byId.getValue(def.id).kind)
        }
    }

    @Test
    fun `color tokens cycle through the fixed 12-swatch ramp`() {
        val categories = buildDefaultCategories()
        categories.forEachIndexed { index, category ->
            assertEquals("cat-${(index % 12) + 1}", category.colorToken)
        }
        // 18 categories means the ramp visibly repeats — pin that the 13th
        // (index 12) wraps back around to cat-1 rather than overflowing.
        assertEquals("cat-1", categories[12].colorToken)
    }

    @Test
    fun `ids are unique`() {
        val ids = buildDefaultCategories().map { it.id }
        assertEquals(ids.size, ids.toSet().size)
    }

    @Test
    fun `the fallback Other category is present`() {
        val ids = buildDefaultCategories().map { it.id }
        assertTrue(ids.contains(CATEGORY_IDS.other))
    }

    @Test
    fun `every pinned default id resolves to a real seeded category`() {
        val ids = buildDefaultCategories().map { it.id }.toSet()
        for (pinned in DEFAULT_PINNED_CATEGORY_IDS) {
            assertTrue("pinned id '$pinned' should be a real category id", ids.contains(pinned))
        }
    }
}
