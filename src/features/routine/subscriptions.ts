/**
 * Subscription truth list — PERSONAL.md §5.
 *
 * The four real subscriptions are seeded as *known truth* (`@/personal/plan`'s
 * `KNOWN_SUBSCRIPTIONS`), not re-derived every month. This module's only job is to
 * notice something genuinely new: a recurring series categorised as a subscription
 * whose merchant doesn't match one of the four known ones.
 *
 * "Recurring" is what does the honest work here, not a merchant-name guess: a series
 * only exists in `RecurringSeries[]` at all once the detector (`src/features/recurring/
 * detect.ts`, this feature doesn't touch it) has seen at least 3 occurrences landing at
 * a consistent cadence. A single large one-off charge — the exact shape of the
 * "$206/month" mistake `@/personal/plan`'s `MISLEADING_PRIOR_SUBSCRIPTIONS_FIGURE_CENTS`
 * documents (two one-off Anthropic charges misread as a subscription) — never clusters
 * into a series and never reaches this function. Distinguishing "recurring" from
 * "one-off" is therefore inherited from the detector's own occurrence/cadence bar, not
 * re-implemented here.
 */
import type { RecurringSeries } from '@/types';
import { KNOWN_SUBSCRIPTIONS, CATEGORY_IDS } from '@/personal/plan';
import { normalizeMerchant } from '@/features/transactions/merchant';

function isKnownSubscription(merchant: string): boolean {
  const norm = normalizeMerchant(merchant);
  if (!norm) return false;
  return KNOWN_SUBSCRIPTIONS.some((known) => {
    const knownNorm = normalizeMerchant(known.merchant);
    return Boolean(knownNorm) && (norm.includes(knownNorm) || knownNorm.includes(norm));
  });
}

/**
 * Recurring series that look like a subscription (categorised `cat-subscriptions`,
 * i.e. the frozen category id PERSONAL.md §3 reserves for exactly this) but whose
 * merchant doesn't match any of the four known ones. Muted series are excluded — the
 * user already dismissed them from the radar elsewhere.
 */
export function detectUnknownSubscriptions(recurring: readonly RecurringSeries[]): RecurringSeries[] {
  return recurring.filter(
    (s) => !s.muted && s.categoryId === CATEGORY_IDS.subscriptions && !isKnownSubscription(s.merchant)
  );
}
