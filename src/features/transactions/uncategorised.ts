/**
 * The uncategorised-imports queue (DESIGN-V3.md §5.3 / §5 item 3): "an import the
 * user cannot quickly clean up is an import they stop trusting." Every CSV import
 * that couldn't be confidently matched lands in the frozen fallback "Other" category
 * (`CATEGORY_IDS.other`, PERSONAL.md §3) — this module is the single, reusable
 * definition of what counts as "still needs a category", so the Transactions screen
 * and the (separately owned) guided weekly-review flow agree on the same count.
 *
 * Deliberately scoped to `source === 'csv'`: a manual log entry the user filed under
 * "Other" on purpose isn't a queue item — this is specifically about imports the user
 * hasn't looked at yet, not a general "everything in Other" view.
 */
import type { Category, Txn } from '@/types';
import { CATEGORY_IDS } from '@/personal/plan';

/** The frozen fallback/"Other" category id (PERSONAL.md §3) — what "uncategorised" means app-wide. */
export const UNCATEGORISED_CATEGORY_ID: string = CATEGORY_IDS.other;

/**
 * Imported transactions still sitting in the fallback category. Excluded transactions
 * are left out too — they're already out of scope for budgets/insights, so surfacing
 * them here would just be noise in a queue that's supposed to feel clearable.
 */
export function selectUncategorisedTxns(txns: readonly Txn[], categories: readonly Category[]): Txn[] {
  // Guard: if a corrupted/custom category set has no "Other" bucket at all, there is
  // nothing to queue rather than a crash or a nonsensical count.
  if (!categories.some((c) => c.id === UNCATEGORISED_CATEGORY_ID)) return [];
  return txns.filter((t) => t.source === 'csv' && !t.excluded && t.categoryId === UNCATEGORISED_CATEGORY_ID);
}

/** Cheap count-only variant for callers (e.g. a "Needs you" summary row) that only need the number. */
export function countUncategorisedTxns(txns: readonly Txn[], categories: readonly Category[]): number {
  return selectUncategorisedTxns(txns, categories).length;
}
