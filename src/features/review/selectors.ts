/**
 * Pure selectors for the weekly-review guided flow (DESIGN-V3.md §5 deliverable 3,
 * PERSONAL.md §8's first-Saturday ritual). No store access — `WeeklyReviewFlow.tsx`
 * is the thin React/store wrapper, same split as `src/features/routine/state.ts`.
 */
import type { Category, RecurringSeries, Txn } from '@/types';
import { CATEGORY_IDS } from '@/personal/plan';

/**
 * The id of the catch-all "Other" category, if this vault has one. Prefers the
 * frozen `cat-other` id (every vault created via `buildDefaultCategories`
 * carries it); falls back to a label match so a vault with a differently-seeded
 * category set (e.g. demo data, a future default set) still resolves sensibly.
 */
export function otherCategoryId(categories: Category[]): string | null {
  const byFrozenId = categories.find((c) => c.id === CATEGORY_IDS.other);
  if (byFrozenId) return byFrozenId.id;
  const byLabel = categories.find((c) => /other|uncategor/i.test(c.label));
  return byLabel?.id ?? null;
}

/**
 * Transactions that still need a human decision. `src/categorize/categorize.ts`
 * parks anything it can't confidently match (`matchedBy: 'unmatched'`) in this
 * same catch-all "Other" category at import time — that per-row signal isn't
 * persisted on `Txn` itself, so "sitting in Other" is the durable, post-commit
 * proxy for "the categoriser guessed and it needs a human". Excludes
 * already-excluded transactions (reimbursements/transfers) — those are
 * deliberately out of scope, not "needs review". Newest first, matching the
 * store's own `txns` ordering.
 */
export function uncategorisedTxns(txns: Txn[], categories: Category[]): Txn[] {
  const otherId = otherCategoryId(categories);
  if (!otherId) return [];
  return txns.filter((t) => t.categoryId === otherId && !t.excluded);
}

/**
 * Recurring series the recurring radar has detected but the user hasn't yet
 * confirmed or dismissed. `confirmed`/`muted` are declaration-merged onto
 * `RecurringSeries` by `src/features/statements/types.ts` and
 * `src/types.ts` respectively — read here, never redefined.
 */
export function unconfirmedRecurring(recurring: RecurringSeries[]): RecurringSeries[] {
  return recurring.filter((s) => !s.muted && !s.confirmed);
}
