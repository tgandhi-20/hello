/**
 * "Suggest budgets" — CONTRACTS.md §4's budgets brief: a genuinely useful onboarding
 * shortcut built from the user's own 3-month average spend, beating a blank-page guess.
 */
import type { Cents, Category, MonthStr, Txn } from '@/types';
import { safeDiv } from '@/charts';
import { prevMonth } from '../insights/monthMath';

const HEADROOM = 1.1; // suggest slightly above the average so it's not an instant over-budget
const ROUND_TO_CENTS = 500; // round suggestions to the nearest $5

function roundUpTo(cents: number, step: number): Cents {
  if (cents <= 0) return 0;
  return Math.ceil(cents / step) * step;
}

/**
 * Average spend per category over up to `lookbackMonths` months preceding `month`
 * (never including `month` itself, so a still-in-progress month can't drag the
 * average down). Categories with no history in that window are omitted — nothing to
 * suggest for a category that's never been spent in.
 */
export function suggestBudgetsFromHistory(
  txns: Txn[],
  categories: Category[],
  month: MonthStr,
  lookbackMonths = 3
): Map<string, Cents> {
  const months: MonthStr[] = [];
  let cursor = month;
  for (let i = 0; i < lookbackMonths; i++) {
    cursor = prevMonth(cursor);
    months.push(cursor);
  }

  // categoryId -> monthsSeen -> totalCents, so the average only divides by months that
  // actually have data for that category (a one-off month with no Netflix charge
  // shouldn't drag the Netflix suggestion toward zero).
  const totals = new Map<string, Cents>();
  const monthsSeen = new Map<string, Set<MonthStr>>();

  for (const t of txns) {
    if (t.excluded || t.amountCents <= 0 || !months.includes(t.date.slice(0, 7))) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountCents);
    const seen = monthsSeen.get(t.categoryId) ?? new Set<MonthStr>();
    seen.add(t.date.slice(0, 7));
    monthsSeen.set(t.categoryId, seen);
  }

  const validCategoryIds = new Set(categories.map((c) => c.id));
  const out = new Map<string, Cents>();
  for (const [categoryId, total] of totals) {
    if (!validCategoryIds.has(categoryId)) continue;
    const seenCount = monthsSeen.get(categoryId)?.size ?? 0;
    const average = safeDiv(total, seenCount, 0);
    out.set(categoryId, roundUpTo(average * HEADROOM, ROUND_TO_CENTS));
  }
  return out;
}
