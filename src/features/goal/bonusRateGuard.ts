/**
 * The October 2026 bonus-rate guard (docs/PERSONAL.md §6, `OCTOBER_2026_TRAP` in
 * src/personal/plan.ts).
 *
 * Bonus-rate savers TYPICALLY require deposits to exceed withdrawals in a month to
 * keep the higher rate; failing that usually drops the account to a base rate for
 * that month. October 2026 fails on the numbers in this plan: $9,500 out (the PR/189
 * visa + India ticket) against $3,500 in (the standard contribution).
 *
 * ⚠️ UNVERIFIED, on purpose. `OCTOBER_2026_TRAP.verified === false` — the source
 * document itself flags this "to verify" with Bankwest. It is a description of how
 * bonus-rate savers COMMONLY work, not a confirmed term of this specific account.
 * This module must never present it as established fact, and every string here says
 * "typically" / "worth confirming" rather than asserting the rate will actually drop.
 *
 * The projection engine (`projection.ts`) deliberately does NOT bake this penalty
 * into the modelled balance — the two stated rates (5.2%/5.0%) are applied
 * unconditionally there. This module is a separate, clearly-labelled warning layer
 * on top, not a silent adjustment to the numbers.
 *
 * This is written as a GENERAL scan (any month where withdrawals exceed deposits,
 * not a hardcoded "if month === October 2026" check) so it keeps working correctly
 * if a what-if or a future plan revision moves a one-off into a different month.
 */
import type { Cents, MonthStr } from '@/types';
import { INCOME, OCTOBER_2026_TRAP } from '@/personal/plan';
import type { MonthlyProjectionPoint } from './projection';

export const GUARD_UNVERIFIED_NOTICE =
  'Bonus-rate savers typically need deposits to beat withdrawals each month to keep the higher rate — ' +
  "this hasn't been confirmed with Bankwest for this account. Worth checking before this month arrives.";

export const GUARD_SUGGESTED_FIX = OCTOBER_2026_TRAP.note;

export interface BonusRateGuardWarning {
  month: MonthStr;
  depositsCents: Cents;
  withdrawalsCents: Cents;
  oneOffLabels: readonly string[];
  /** Rough order-of-magnitude estimate of what a month at the base fallback rate
   *  instead of the plan's rate would cost, computed from this month's own opening
   *  balance — NOT a quote, NOT confirmed, purely illustrative of scale. Post-tax,
   *  consistent with the rest of the projection's convention. For October 2026 this
   *  independently lands close to `OCTOBER_2026_TRAP.estimatedCostCents` (~$135,
   *  the source document's own estimate) without referencing that figure directly. */
  approxCostIfDroppedCentsUnverified: Cents;
  notice: string;
  suggestedFix: string;
}

/**
 * Scan a projected series and flag every month whose withdrawals exceed deposits.
 * Pure function — takes points, returns warnings, no side effects, no store access.
 */
export function findBonusRateGuardWarnings(
  points: readonly MonthlyProjectionPoint[]
): readonly BonusRateGuardWarning[] {
  const warnings: BonusRateGuardWarning[] = [];
  const marginalTaxRate = INCOME.marginalRatePct / 100;

  for (const point of points) {
    if (!point.withdrawalsExceedDeposits) continue;

    const baseMonthlyRate = OCTOBER_2026_TRAP.baseRateFallbackPct / 100 / 12;
    const actualMonthlyRate = point.annualRatePct / 100 / 12;
    // Guarded: if the plan's rate is ever at or below the base rate this is <= 0,
    // which is fine (no "cost" to flag) rather than a divide-by-zero — there's no
    // division here at all, only multiplication, so there's no NaN/Infinity risk.
    const lostGrossCents = Math.max(0, point.openingBalanceCents * (actualMonthlyRate - baseMonthlyRate));
    const lostNetCents = Math.round(lostGrossCents * (1 - marginalTaxRate));

    warnings.push({
      month: point.month,
      depositsCents: point.depositsCents,
      withdrawalsCents: point.withdrawalsCents,
      oneOffLabels: point.oneOffLabels,
      approxCostIfDroppedCentsUnverified: lostNetCents,
      notice: GUARD_UNVERIFIED_NOTICE,
      suggestedFix: GUARD_SUGGESTED_FIX,
    });
  }

  return warnings;
}
