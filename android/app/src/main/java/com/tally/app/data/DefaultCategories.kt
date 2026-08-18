package com.tally.app.data

import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import com.tally.app.personal.PERSONAL_CATEGORIES
import com.tally.app.personal.PersonalCategoryDef

/**
 * Tally — default category set. Kotlin port of src/data/defaultCategories.ts.
 *
 * Ids, labels and kinds come from `com.tally.app.personal.PERSONAL_CATEGORIES`
 * (docs/PERSONAL.md §3, FROZEN) — this file adds only the bits that package
 * intentionally doesn't own: icon name and colour-ramp token.
 *
 * SEEDED ONCE, ON FIRST-RUN (`VaultRepository.setup`/`setupPin`) — see that
 * function's own doc comment. Without this, a brand-new vault has zero
 * categories forever (nothing else in this tree ever creates one): quick-add
 * has nothing to show, every CSV-imported row categorises to an empty
 * `categoryId` instead of falling through to `CATEGORY_IDS.other`, and
 * `ToSortOut.kt`'s "needs a category" nudge can never fire because it
 * specifically matches `CATEGORY_IDS.other`, not an empty string. This
 * mirrors `initializeFreshVault` in src/store/useStore.ts exactly.
 */

private fun categoryKindFromPlanString(kind: String): CategoryKind = when (kind) {
    "need" -> CategoryKind.NEED
    "want" -> CategoryKind.WANT
    "save" -> CategoryKind.SAVE
    else -> CategoryKind.WANT // structurally unreachable — PERSONAL_CATEGORIES only ever uses the three above.
}

/**
 * Icon per category id — mirrors defaultCategories.ts's `ICON_BY_ID`. Kept as
 * a plain lucide-react-style name (`Category.icon`'s own doc comment): no
 * Android drawable resolution happens at this layer, and nothing under `ui/`
 * consumes this field yet, but it is still ported field-for-field for the
 * same byte/shape parity with a `.tally` backup every other domain field
 * here maintains.
 */
private val ICON_BY_ID: Map<String, String> = mapOf(
    "cat-rent" to "Home",
    "cat-sublet" to "Key",
    "cat-utilities" to "Zap",
    "cat-family" to "Users",
    "cat-groceries" to "ShoppingCart",
    "cat-transport" to "Bus",
    "cat-eating-out" to "UtensilsCrossed",
    "cat-lunch" to "Sandwich",
    "cat-coffee" to "Coffee",
    "cat-health" to "HeartPulse",
    "cat-phone" to "Smartphone",
    "cat-shopping" to "ShoppingBag",
    "cat-subscriptions" to "Repeat",
    "cat-skincare" to "Sparkles",
    "cat-savings" to "PiggyBank",
    "cat-income" to "Wallet",
    "cat-oneoff" to "Plane",
    "cat-other" to "MoreHorizontal",
)

/** The categories that float to the front of quick-add on a fresh install —
 *  mirrors defaultCategories.ts's `DEFAULT_PINNED_CATEGORY_IDS`. */
val DEFAULT_PINNED_CATEGORY_IDS: List<String> = listOf(
    "cat-coffee",
    "cat-lunch",
    "cat-eating-out",
    "cat-groceries",
    "cat-transport",
)

/**
 * Builds the full default [Category] list from [PERSONAL_CATEGORIES], in
 * plan order (`order` = index), colour tokens cycling through the fixed
 * 12-swatch ramp (`cat-1`..`cat-12`) the same way defaultCategories.ts's
 * `colorToken: cat-${(i % 12) + 1}` does — there are 18 categories, so the
 * ramp repeats.
 */
fun buildDefaultCategories(): List<Category> =
    PERSONAL_CATEGORIES.mapIndexed { index, def: PersonalCategoryDef ->
        Category(
            id = def.id,
            label = def.label,
            icon = ICON_BY_ID[def.id] ?: "Circle",
            colorToken = "cat-${(index % 12) + 1}",
            kind = categoryKindFromPlanString(def.kind),
            builtin = true,
            order = index,
        )
    }
