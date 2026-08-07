/**
 * Savings-rate what-if — "what does saving a different amount each month cost or buy".
 *
 * Reuses the same identity the frozen plan itself is built on (docs/PERSONAL.md §0/§3,
 * `PLAN_DEFAULTS` in src/personal/plan.ts):
 *
 *     take-home − living costs − savings = food budget
 *
 * i.e. `INCOME.netMonthlyCents − savingsRate − nonFoodFixedCostsCents` is what's left
 * for the food group (groceries + eating out + lunch + coffee) that month, where
 * `nonFoodFixedCostsCents = LIVING_COSTS_CENTS − FOOD_GROUP_MONTHLY_CAP_CENTS` (both
 * exported from plan.ts). This is exactly the formula that reproduces the plan's own
 * $141/week at $3,500/month (see plan.ts's own FOOD_GROUP_WEEKLY_TARGET_CENTS and the
 * check suite), so the what-if stays internally consistent with every other figure in
 * the app rather than introducing a second, disagreeing food-budget formula.
 *
 * NOTE on the two example figures the task brief quoted from the ORIGINAL source
 * document ($3,000/mo → ~$235/week, $3,500/mo → ~$141/week): only the $3,500 anchor
 * reconciles exactly against this formula. The $3,000 anchor implies a different
 * (slightly higher, ~$92/month) non-food-fixed-costs assumption than the one frozen in
 * docs/PERSONAL.md §3 / plan.ts's LIVING_COSTS_CENTS. This module derives every preset
 * from the frozen plan's own figures rather than hardcoding the source document's
 * slightly-inconsistent numbers — see the goal feature's report for the full note.
 */
import type { Cents } from '@/types';
import { FOOD_GROUP_MONTHLY_CAP_CENTS, INCOME, LIVING_COSTS_CENTS, monthlyToWeeklyCents } from '@/personal/plan';
import { buildGoalProjection } from './projection';

/** Fixed monthly living costs outside the food group — the base the what-if solves
 *  around. LIVING_COSTS_CENTS − FOOD_GROUP_MONTHLY_CAP_CENTS = 234,700c ($2,347). */
export const NON_FOOD_FIXED_LIVING_COSTS_CENTS: Cents = LIVING_COSTS_CENTS - FOOD_GROUP_MONTHLY_CAP_CENTS;

export interface SavingsRateScenario {
  monthlySavingsCents: Cents;
  /** Can be negative — a savings rate high enough to make the budget infeasible is
   *  informative, not hidden. `feasible` is the thing to branch UI rendering on. */
  monthlyFoodBudgetCents: Cents;
  /** Same figure, converted at the correct ×12÷52 rate (never ×4 — PERSONAL.md §1). */
  weeklyFoodBudgetCents: Cents;
  feasible: boolean;
  /** The full projection at this savings rate, so the caller can chart it directly. */
  finalPoolCents: Cents;
  finalPoolGapVsTargetCents: Cents;
}

/** Evaluate one candidate monthly savings rate against both the food budget it leaves
 *  and the deposit pool it produces by the target date. */
export function computeSavingsRateScenario(monthlySavingsCents: Cents): SavingsRateScenario {
  const monthlyFoodBudgetCents = INCOME.netMonthlyCents - monthlySavingsCents - NON_FOOD_FIXED_LIVING_COSTS_CENTS;
  const feasible = monthlyFoodBudgetCents >= 0;
  const weeklyFoodBudgetCents = monthlyToWeeklyCents(Math.max(0, monthlyFoodBudgetCents));

  const projection = buildGoalProjection({ monthlyContributionCents: monthlySavingsCents });

  return {
    monthlySavingsCents,
    monthlyFoodBudgetCents,
    weeklyFoodBudgetCents,
    feasible,
    finalPoolCents: projection.finalBalanceCents,
    finalPoolGapVsTargetCents: projection.gapCents,
  };
}

/** A small, sensible set of preset rates either side of the plan's own $3,500 —
 *  cheap enough to compute all five eagerly (14 months × 5 scenarios is trivial). */
export const WHAT_IF_PRESET_MONTHLY_SAVINGS_CENTS: readonly Cents[] = [
  250_000, // $2,500
  300_000, // $3,000
  350_000, // $3,500 — the plan
  400_000, // $4,000
  450_000, // $4,500
] as const;

export function buildWhatIfPresets(): readonly SavingsRateScenario[] {
  return WHAT_IF_PRESET_MONTHLY_SAVINGS_CENTS.map(computeSavingsRateScenario);
}
