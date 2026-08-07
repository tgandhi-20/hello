/**
 * Pure planning logic for `deleteCategory` (CONTRACTS.md §9), split out of `useStore.ts`
 * so it can be unit-tested without IndexedDB/WebCrypto (there is no `indexedDB` global in
 * plain Node, and we're not adding a fake-indexeddb dependency just for a test harness —
 * see `src/store/__checks__/run.ts`).
 *
 * The bug this fixes: deleting a category used to remove only the `Category` record,
 * leaving `Txn.categoryId` dangling (orphaned transactions with no category to render)
 * and leaving that category's `Budget` rows in storage forever — invisible (screens only
 * iterate live categories) but still summed into "total budgeted" on both the Budgets and
 * Dashboard screens, permanently padding a number the user can never see or clear.
 */
import type { Budget, Category, Txn } from '@/types';

export interface CategoryDeletionPlan {
  /** Full updated txns array, with any `categoryId === deletedId` reassigned to the fallback. */
  txns: Txn[];
  /** Full updated budgets array, with the deleted category's rows removed. */
  budgets: Budget[];
  /** Just the txns that were actually reassigned — the subset that needs persisting. */
  changedTxns: Txn[];
  /** (categoryId, month) keys of the budget rows that were removed — for cleaning up `budgetIndex`. */
  removedBudgetKeys: { categoryId: string; month: string }[];
}

/**
 * Resolve which category should inherit a deleted category's transactions.
 * Prefers the built-in "Other" category (`cat-other`) by id; falls back to any other
 * built-in category if `cat-other` is somehow missing; `null` if there is truly nowhere
 * to reassign to (should only happen on a corrupted/empty category set).
 */
export function resolveFallbackCategoryId(categories: readonly Category[], deletingId: string): string | null {
  const other = categories.find((c) => c.id === 'cat-other' && c.id !== deletingId);
  if (other) return other.id;
  const anyBuiltin = categories.find((c) => c.builtin && c.id !== deletingId);
  return anyBuiltin ? anyBuiltin.id : null;
}

/**
 * Compute the full effect of deleting `categoryId`: every transaction pointed at it is
 * reassigned to `fallbackCategoryId` (never left dangling), and every budget row for it
 * (in any month) is dropped (never left invisibly padding a total). Pure — does not
 * touch the store, IndexedDB, or `Date.now()` internally, so it's fully deterministic
 * and testable.
 */
export function planCategoryDeletion(
  txns: readonly Txn[],
  budgets: readonly Budget[],
  categoryId: string,
  fallbackCategoryId: string,
  now: number
): CategoryDeletionPlan {
  const changedTxns: Txn[] = [];
  const nextTxns = txns.map((t) => {
    if (t.categoryId !== categoryId) return t;
    const updated: Txn = { ...t, categoryId: fallbackCategoryId, updatedAt: now };
    changedTxns.push(updated);
    return updated;
  });

  const removedBudgetKeys: { categoryId: string; month: string }[] = [];
  const nextBudgets = budgets.filter((b) => {
    if (b.categoryId !== categoryId) return true;
    removedBudgetKeys.push({ categoryId: b.categoryId, month: b.month });
    return false;
  });

  return { txns: nextTxns, budgets: nextBudgets, changedTxns, removedBudgetKeys };
}
