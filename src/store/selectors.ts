/**
 * Tally — pure selectors over store state (CONTRACTS.md §9).
 *
 * These six are Agent 2's contractually-required set. They take plain state
 * (never the store hook itself) so any agent can compose or memoise them.
 * Other agents add their own selectors in their own directories.
 *
 * Convention: "spend" means `amountCents > 0` (money out); "income" means
 * `amountCents < 0` (money in), per CONTRACTS.md §3. `excluded` transactions
 * (reimbursed expenses, internal transfers) are left out of every aggregate
 * but still returned by `txnsForMonth`, since callers may want to show them
 * struck-through rather than silently vanish them.
 */
import type { Category, DayCell, MonthStr, Txn } from '@/types';
import { addDays, daysInMonth, monthOf, startOfMonth } from '@/ui/format';

/** All transactions whose date falls within `month` (`YYYY-MM`), unfiltered by `excluded`. */
export function txnsForMonth(txns: Txn[], month: MonthStr): Txn[] {
  return txns.filter((t) => monthOf(t.date) === month);
}

/** Sum of spend (positive amountCents) per categoryId for the month, excluding `excluded` txns. */
export function spendByCategory(txns: Txn[], month: MonthStr): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txnsForMonth(txns, month)) {
    if (t.excluded || t.amountCents <= 0) continue;
    out[t.categoryId] = (out[t.categoryId] ?? 0) + t.amountCents;
  }
  return out;
}

/** Total spend (integer cents) for the month, excluding `excluded` txns and income rows. */
export function totalSpendCents(txns: Txn[], month: MonthStr): number {
  return txnsForMonth(txns, month).reduce(
    (sum, t) => (!t.excluded && t.amountCents > 0 ? sum + t.amountCents : sum),
    0
  );
}

/** Total income (integer cents, as a positive number) for the month, excluding `excluded` txns. */
export function incomeCents(txns: Txn[], month: MonthStr): number {
  return txnsForMonth(txns, month).reduce(
    (sum, t) => (!t.excluded && t.amountCents < 0 ? sum + -t.amountCents : sum),
    0
  );
}

/** One cell per calendar day in `month`, shaded by spend intensity (0–1) for the heatmap. */
export function dayCells(txns: Txn[], month: MonthStr): DayCell[] {
  const totalsByDay = new Map<string, { total: number; count: number }>();
  for (const t of txnsForMonth(txns, month)) {
    if (t.excluded || t.amountCents <= 0) continue;
    const entry = totalsByDay.get(t.date) ?? { total: 0, count: 0 };
    entry.total += t.amountCents;
    entry.count += 1;
    totalsByDay.set(t.date, entry);
  }

  const start = startOfMonth(month);
  const n = daysInMonth(month);
  const raw: { date: string; totalCents: number; txnCount: number }[] = [];
  let maxTotal = 0;

  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    const entry = totalsByDay.get(date);
    const totalCents = entry?.total ?? 0;
    if (totalCents > maxTotal) maxTotal = totalCents;
    raw.push({ date, totalCents, txnCount: entry?.count ?? 0 });
  }

  return raw.map((c) => ({
    ...c,
    intensity: maxTotal > 0 ? c.totalCents / maxTotal : 0,
  }));
}

/** Look up a category by id. Returns undefined if it's been deleted. */
export function categoryById(categories: Category[], id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
