package com.tally.app.money

import com.tally.app.personal.CATEGORY_IDS
import com.tally.app.personal.FOOD_GROUP_CATEGORY_IDS
import java.time.LocalDate

/**
 * The food-group weekly slice. Ported from src/money/food.ts. Sums food-group
 * transactions within a Monday-Sunday window, and nothing else computes that
 * sum independently anywhere in this package.
 */
data class FoodGroupTotals(
    val groceriesCents: Cents,
    /** eating-out + lunch + coffee — "someone else made it" vs groceries "cooked at home". */
    val awayCents: Cents,
    val totalCents: Cents
)

/**
 * Sum food-group spend within `[weekStart, weekEnd]` inclusive. Excludes
 * excluded transactions, non-spend (income/refund) rows, and any transaction
 * id in [excludeTxnIds] (committed-recurring transactions already counted
 * elsewhere — see `computeMonthMoney`'s doc comment on double-counting).
 */
fun sumFoodGroupCents(
    txns: List<Txn>,
    weekStart: LocalDate,
    weekEnd: LocalDate,
    excludeTxnIds: Set<String> = emptySet()
): FoodGroupTotals {
    var groceriesCents: Cents = 0
    var awayCents: Cents = 0

    for (t in txns) {
        if (t.excluded || t.amountCents <= 0) continue
        if (t.date.isBefore(weekStart) || t.date.isAfter(weekEnd)) continue
        if (excludeTxnIds.contains(t.id)) continue
        if (t.categoryId !in FOOD_GROUP_CATEGORY_IDS) continue

        if (t.categoryId == CATEGORY_IDS.groceries) groceriesCents += t.amountCents else awayCents += t.amountCents
    }

    return FoodGroupTotals(groceriesCents, awayCents, groceriesCents + awayCents)
}
