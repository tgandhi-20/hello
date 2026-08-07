/**
 * Figures this feature needs that live in `src/personal/plan.ts` (Agent P1's frozen
 * single source of truth — PERSONAL.md's own rule) are imported from there directly;
 * see the re-exports at the bottom of this file and the direct imports in the rest of
 * `src/features/routine/**`. `plan.ts` did not exist yet for most of this feature's
 * build, so it was checked and re-checked as it landed — this file is what's left over:
 * the small number of PERSONAL.md figures `plan.ts` genuinely does not carry.
 *
 * Each constant below states exactly which PERSONAL.md section it transcribes and why
 * it isn't sourced from `plan.ts`. If `plan.ts` grows these later, this file shrinks to
 * match — one file to update, not a hunt through the feature.
 */
import type { Cents } from '@/types';
import {
  AUGUST_2026_EVENTS,
  PERSONAL_CATEGORIES,
  CATEGORY_IDS,
  monthlyToWeeklyCents,
} from '@/personal/plan';

/**
 * Amex's carried-balance interest rate — PERSONAL.md §8: "Amex charges 23.99%: any
 * interest paid there instantly outweighs everything this plan earns in savings
 * interest." `plan.ts` does not carry this figure (it has the August due DATE via
 * `AUGUST_2026_EVENTS`, not the interest rate) — kept here as the one Amex figure
 * this feature needs that has nowhere else to live.
 */
export const AMEX_INTEREST_RATE_PCT = 23.99;

/**
 * "Subscriptions + coffee + phone squeezed together total ~$250/month" — PERSONAL.md
 * §9's salary-leverage risk note. `plan.ts`'s header explicitly says it deliberately
 * omits §9's narrative asides as non-essential to other modules; this is the one such
 * aside this feature's risk notes actually need to state. Note for whoever reconciles
 * this later: the three relevant category caps in `plan.ts` (subscriptions $36 +
 * coffee $60 + phone $81 = $177) don't sum to $250 either — PERSONAL.md's own "~$250"
 * appears to net current actual spend, not the caps, so it isn't safely re-derivable
 * from `PERSONAL_CATEGORIES` and is transcribed verbatim instead.
 */
export const SQUEEZE_MONTHLY_CENTS: Cents = 25_000;

/**
 * Default day-of-month Amex is due, DERIVED from `plan.ts`'s `AUGUST_2026_EVENTS`
 * (the "11 Aug | Amex due" line — August was simply the month the source plan
 * happened to document) rather than a fresh "11" literal here. Falls back to 11 only
 * if that event is ever renamed/removed from `plan.ts` in a way that breaks the lookup.
 */
export const DEFAULT_AMEX_DUE_DAY_OF_MONTH: number = (() => {
  const amexEvent = AUGUST_2026_EVENTS.find((e) => e.label === 'Amex due' && e.date);
  return amexEvent?.date ? Number(amexEvent.date.slice(8, 10)) : 11;
})();

/**
 * The "$600/wk" full rent liability behind the Room 2 vacancy risk (PERSONAL.md §9),
 * DERIVED from `plan.ts`'s `cat-rent` monthly cap (§3: $2,600/month, "$600/wk" per its
 * own note) via `plan.ts`'s own `monthlyToWeeklyCents` (×12÷52) — not a fresh "$600"
 * literal. 260_000 × 12 ÷ 52 = 60_000 exactly.
 */
export const ROOM_VACANCY_WEEKLY_LIABILITY_CENTS: Cents = (() => {
  const rent = PERSONAL_CATEGORIES.find((c) => c.id === CATEGORY_IDS.rent);
  return monthlyToWeeklyCents(rent?.capCents ?? 260_000);
})();
