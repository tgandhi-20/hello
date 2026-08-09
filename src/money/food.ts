/**
 * The food-group weekly slice — the single definition of "how much of the food
 * group has this week's spend touched", reused by `computeMonthMoney`'s
 * `foodThisWeek` field and by anything else in `src/money` that needs it.
 *
 * DESIGN-V4.md §1: "Food this week = a slice of that breakdown, with a target.
 * It is a fact about where the money went, not a second budget to reconcile."
 * So this file does exactly one small thing — sum food-group transactions
 * within a Monday-Sunday window — and nothing else computes that sum
 * independently anywhere in `src/money`.
 *
 * Category ids and the weekly target are imported from `src/personal/plan.ts`
 * (PERSONAL.md §4's frozen $141/week headline) — never re-derived here.
 */
import type { Cents, DateStr, Txn } from '@/types';
import { CATEGORY_IDS, FOOD_GROUP_CATEGORY_IDS } from '@/personal/plan';

/** `FOOD_GROUP_CATEGORY_IDS` is typed as `readonly PersonalCategoryId[]`; widened to
 *  `readonly string[]` so it can be tested against a `Txn.categoryId` (plain `string`)
 *  without a strict-mode type error — same pattern as `src/features/food/config.ts`. */
const FOOD_IDS: readonly string[] = FOOD_GROUP_CATEGORY_IDS;

export interface FoodGroupTotals {
  groceriesCents: Cents;
  /** eating-out + lunch + coffee — "someone else made it" vs groceries "cooked at home". */
  awayCents: Cents;
  totalCents: Cents;
}

/**
 * Sum food-group spend within `[weekStart, weekEnd]` inclusive. Excludes
 * excluded transactions, non-spend (income/refund) rows, and any transaction
 * id in `excludeTxnIds` (committed-recurring transactions already counted
 * elsewhere — see `computeMonthMoney`'s doc comment on double-counting).
 */
export function sumFoodGroupCents(
  txns: readonly Txn[],
  weekStart: DateStr,
  weekEnd: DateStr,
  excludeTxnIds: ReadonlySet<string> = new Set()
): FoodGroupTotals {
  let groceriesCents: Cents = 0;
  let awayCents: Cents = 0;

  for (const t of txns) {
    if (t.excluded || t.amountCents <= 0) continue;
    if (t.date < weekStart || t.date > weekEnd) continue;
    if (excludeTxnIds.has(t.id)) continue;
    if (!FOOD_IDS.includes(t.categoryId)) continue;

    if (t.categoryId === CATEGORY_IDS.groceries) groceriesCents += t.amountCents;
    else awayCents += t.amountCents;
  }

  return { groceriesCents, awayCents, totalCents: groceriesCents + awayCents };
}
