/**
 * Insights/Trends selectors. Pure functions over `Txn[]`/`Category[]` — Agent 2's §9
 * selectors cover the basics (`txnsForMonth`, `totalSpendCents`, …); these are the
 * extra ones CONTRACTS.md §9 explicitly invites other agents to add in their own
 * directories, kept local to avoid guessing at the shape of `spendByCategory`.
 */
import type { Category, Cents, MonthStr, Txn } from '@/types';
import { safeDiv } from '@/charts';
import { daysInMonth } from '@/ui/format';
import { WEEKDAY_LABELS_MON_FIRST, daysElapsedInMonth, isCurrentMonth, mondayIndex } from './monthMath';

function monthSpendTxns(txns: Txn[], month: MonthStr): Txn[] {
  return txns.filter((t) => t.date.startsWith(month) && !t.excluded && t.amountCents > 0);
}

/** categoryId -> total spend cents, for one month. */
export function spendByCategoryLocal(txns: Txn[], month: MonthStr): Map<string, Cents> {
  const out = new Map<string, Cents>();
  for (const t of monthSpendTxns(txns, month)) {
    out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return out;
}

export interface KindSplit {
  needCents: Cents;
  wantCents: Cents;
  saveCents: Cents;
  totalCents: Cents;
}

/** Needs/wants/savings split for a month, from each category's `kind`. */
export function needsWantsSplit(txns: Txn[], categories: Category[], month: MonthStr): KindSplit {
  const catKind = new Map(categories.map((c) => [c.id, c.kind]));
  let needCents = 0;
  let wantCents = 0;
  let saveCents = 0;
  for (const t of monthSpendTxns(txns, month)) {
    const kind = catKind.get(t.categoryId);
    if (kind === 'need') needCents += t.amountCents;
    else if (kind === 'save') saveCents += t.amountCents;
    else wantCents += t.amountCents; // default bucket: unknown/uncategorised counts as a want
  }
  return { needCents, wantCents, saveCents, totalCents: needCents + wantCents + saveCents };
}

/** Average spend per day elapsed so far in `month`. Guarded — never NaN/Infinity. */
export function averageDailySpendCents(txns: Txn[], month: MonthStr): Cents {
  const total = monthSpendTxns(txns, month).reduce((sum, t) => sum + t.amountCents, 0);
  const elapsed = isCurrentMonth(month) ? daysElapsedInMonth(month) : daysInMonth(month);
  return Math.round(safeDiv(total, Math.max(elapsed, 1), 0));
}

export interface WeekdaySpend {
  label: string;
  totalCents: Cents;
}

/** Spend bucketed by weekday, Monday-first (Australian convention). */
export function spendByDayOfWeek(txns: Txn[], month: MonthStr): WeekdaySpend[] {
  const totals = new Array(7).fill(0) as Cents[];
  for (const t of monthSpendTxns(txns, month)) {
    totals[mondayIndex(t.date)] += t.amountCents;
  }
  return WEEKDAY_LABELS_MON_FIRST.map((label, i) => ({ label, totalCents: totals[i] }));
}

export interface CategoryMover {
  categoryId: string;
  label: string;
  colorToken: string;
  thisCents: Cents;
  lastCents: Cents;
  deltaCents: Cents;
}

/** Categories with the biggest absolute spend change vs the previous month, largest first. */
export function biggestMovers(
  txns: Txn[],
  categories: Category[],
  month: MonthStr,
  prevMonthStr: MonthStr,
  limit = 5
): CategoryMover[] {
  const thisMap = spendByCategoryLocal(txns, month);
  const lastMap = spendByCategoryLocal(txns, prevMonthStr);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const ids = new Set([...thisMap.keys(), ...lastMap.keys()]);

  return Array.from(ids)
    .map((id) => {
      const thisCents = thisMap.get(id) ?? 0;
      const lastCents = lastMap.get(id) ?? 0;
      const cat = catMap.get(id);
      return {
        categoryId: id,
        label: cat?.label ?? 'Uncategorised',
        colorToken: cat?.colorToken ?? 'ink-3',
        thisCents,
        lastCents,
        deltaCents: thisCents - lastCents,
      };
    })
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))
    .slice(0, limit);
}

export interface MonthTotal {
  month: MonthStr;
  totalCents: Cents;
}

/** Total spend for each of the last `count` months ending at `month`, oldest first. */
export function trailingMonthTotals(txns: Txn[], month: MonthStr, count = 6): MonthTotal[] {
  const out: MonthTotal[] = [];
  let cursor = month;
  const months: MonthStr[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(cursor);
    const [y, m] = cursor.split('-').map(Number);
    const d = new Date(y, m - 1 - 1, 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  for (const m of months) {
    const total = monthSpendTxns(txns, m).reduce((sum, t) => sum + t.amountCents, 0);
    out.push({ month: m, totalCents: total });
  }
  return out;
}
