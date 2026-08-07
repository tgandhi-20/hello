/**
 * Tally — food-group configuration (PERSONAL.md §3 / §4, frozen).
 *
 * Food group = cat-groceries + cat-eating-out + cat-lunch + cat-coffee.
 * $141/week is the headline target, derived from the plan's $610/month food
 * budget at the mandatory 52/12 weekly conversion (PERSONAL.md §1 — never x4).
 *
 * This file is the single point of contact with `src/personal/plan.ts`
 * (owned by Agent P1, landing concurrently with this feature). Isolating the
 * cross-agent import to one line here means that if P1's actual export name
 * differs from the one assumed below, only this file needs a one-line fix —
 * nothing else in src/features/food/** references '@/personal/plan' directly.
 */
import type { Cents } from '@/types';
// `FOOD_GROUP_WEEKLY_TARGET_CENTS` is plan.ts's own rounded "$141/week" headline
// (PERSONAL.md §4: "**$141/week is the headline target.**"). plan.ts also exports an
// exact, unrounded `FOOD_GROUP_WEEKLY_TARGET_CENTS_PRECISE` ($140.77) for maths that
// needs precision; this card quotes the document's stated headline figure, so it
// imports the headline constant specifically, not the exact one. `CATEGORY_IDS` is
// plan.ts's single frozen source for category id strings (PERSONAL.md §3).
import { FOOD_GROUP_WEEKLY_TARGET_CENTS as PLAN_FOOD_WEEKLY_TARGET_CENTS, CATEGORY_IDS } from '@/personal/plan';

/** $141/week (PERSONAL.md §4) — imported, never hardcoded here. */
export const FOOD_WEEKLY_TARGET_CENTS: Cents = PLAN_FOOD_WEEKLY_TARGET_CENTS;

export const GROCERIES_CATEGORY_ID = CATEGORY_IDS.groceries;
export const LUNCH_CATEGORY_ID = CATEGORY_IDS.lunch;
export const COFFEE_CATEGORY_ID = CATEGORY_IDS.coffee;

/** The frozen id from PERSONAL.md §3. */
export const EATING_OUT_CATEGORY_ID = CATEGORY_IDS.eatingOut;

/**
 * Every category id counted as part of the food group's weekly total.
 *
 * Historical note: for part of this feature's development, `src/data/defaultCategories.ts`
 * (outside this feature's ownership) seeded the eating-out category as `cat-dining-out`
 * rather than the frozen `cat-eating-out` from PERSONAL.md §3, and this file carried a
 * compatibility alias for it. The data layer has since landed seeding `cat-eating-out`
 * correctly (matches `CATEGORY_IDS.eatingOut` above) — the alias was removed once real
 * demo data confirmed the fix, rather than left in as permanent dead code.
 */
export const FOOD_CATEGORY_IDS: readonly string[] = [
  GROCERIES_CATEGORY_ID,
  EATING_OUT_CATEGORY_ID,
  LUNCH_CATEGORY_ID,
  COFFEE_CATEGORY_ID,
];

export function isFoodCategoryId(categoryId: string): boolean {
  return FOOD_CATEGORY_IDS.includes(categoryId);
}
