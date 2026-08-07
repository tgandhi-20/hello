/**
 * Quick-add selectors: category ranking (most-used-first) and smart amount defaults.
 * Pure functions over store state — no store dependency here, so they're trivially
 * testable and reusable from other screens (e.g. the transactions filter bar).
 */
import type { AccountId, Category, Cents, Txn } from '@/types';

/** Only look at manual + csv spend history from the last N days when ranking/suggesting. */
const RECENCY_WINDOW_DAYS = 90;
/** How many of a category's most recent transactions feed the smart amount default. */
const SUGGESTION_SAMPLE_SIZE = 12;

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rank categories for the quick-add grid: pinned categories first (in the order the
 * user pinned them), then everything else by recent usage frequency (most-used first),
 * falling back to the category's own `order` field for ties or zero-history categories.
 */
export function rankedCategories(
  categories: Category[],
  txns: Txn[],
  pinnedCategoryIds: string[] = []
): Category[] {
  const cutoff = daysAgoStr(RECENCY_WINDOW_DAYS);
  const counts = new Map<string, number>();
  for (const t of txns) {
    if (t.excluded || t.date < cutoff) continue;
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }

  const pinnedSet = new Set(pinnedCategoryIds);
  const pinned = pinnedCategoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => Boolean(c));
  const rest = categories
    .filter((c) => !pinnedSet.has(c.id))
    .slice()
    .sort((a, b) => {
      const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return a.order - b.order;
    });

  return [...pinned, ...rest];
}

/**
 * The user's typical amount for a category: the mode (most frequent) of their last
 * dozen spends in that category, tie-broken by recency. Returns `null` when there's no
 * history yet — the amount field starts blank rather than guessing.
 */
export function suggestedAmountCents(categoryId: string, txns: Txn[]): Cents | null {
  const recent = txns
    .filter((t) => t.categoryId === categoryId && t.amountCents > 0 && !t.excluded)
    .slice(0, SUGGESTION_SAMPLE_SIZE); // txns are newest-first per the store contract

  if (recent.length === 0) return null;

  const freq = new Map<number, number>();
  for (const t of recent) {
    freq.set(t.amountCents, (freq.get(t.amountCents) ?? 0) + 1);
  }

  let best = recent[0].amountCents;
  let bestCount = 0;
  // Iterate in original (newest-first) order so the most recent amount wins ties.
  for (const t of recent) {
    const count = freq.get(t.amountCents) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = t.amountCents;
    }
  }
  return best;
}

/** The account used on the most recent transaction, or `'cash'` when there's no history. */
export function lastUsedAccount(txns: Txn[]): AccountId {
  return txns.length > 0 ? txns[0].account : 'cash';
}
