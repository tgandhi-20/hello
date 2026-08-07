/**
 * Streaks & habits — pure computation over transactions + categories, per
 * `HabitStats` in types.ts. No shaming, just facts: a broken streak is a number, not a
 * verdict (CONTRACTS.md §4).
 */
import type { Category, Cents, DateStr, HabitStats, Txn } from '@/types';
import { todayStr } from '@/ui/format';

function parseYMD(d: DateStr): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function addDaysUTC(d: DateStr, days: number): DateStr {
  const dt = new Date(parseYMD(d) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function monthOf(d: DateStr): string {
  return d.slice(0, 7);
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Find a category by (case-insensitive) label substring match, e.g. 'coffee', 'lunch'. */
function findCategory(categories: Category[], labelSubstring: string): Category | undefined {
  const needle = labelSubstring.toLowerCase();
  return categories.find((c) => c.label.toLowerCase().includes(needle));
}

/** Per-day net spend total (excludes `excluded` txns), keyed by DateStr. */
function dailyTotals(txns: Txn[]): Map<DateStr, Cents> {
  const totals = new Map<DateStr, Cents>();
  for (const t of txns) {
    if (t.excluded) continue;
    totals.set(t.date, (totals.get(t.date) ?? 0) + t.amountCents);
  }
  return totals;
}

/** Consecutive no-spend days ending on `date`, walking backwards. */
function streakEndingAt(totals: Map<DateStr, Cents>, date: DateStr, earliestDate: DateStr | null): number {
  // No transaction history means there is no date to walk back to. Without this
  // guard `!earliestDate` keeps the loop condition permanently true and, with an
  // empty totals map, nothing ever breaks it — the app hangs. This is reachable
  // on a brand-new install, and also whenever every transaction is excluded.
  // A streak measured against no history is meaningless, so report none.
  if (!earliestDate) return 0;

  let streak = 0;
  let cursor = date;
  while (cursor >= earliestDate) {
    const total = totals.get(cursor) ?? 0;
    if (total > 0) break; // spend > 0 breaks the streak; a pure-income day is still "no spend"
    streak++;
    cursor = addDaysUTC(cursor, -1);
  }
  return streak;
}

/** Longest no-spend streak anywhere in the transaction history's date range. */
function bestStreak(totals: Map<DateStr, Cents>, earliestDate: DateStr, today: DateStr): number {
  let best = 0;
  let cursor = earliestDate;
  while (cursor <= today) {
    const total = totals.get(cursor) ?? 0;
    if (total > 0) {
      cursor = addDaysUTC(cursor, 1);
      continue;
    }
    // Walk forward through this no-spend run once, rather than re-scanning from
    // `cursor` for every day inside it.
    let runEnd = cursor;
    let runLen = 0;
    while (runEnd <= today && (totals.get(runEnd) ?? 0) <= 0) {
      runLen++;
      runEnd = addDaysUTC(runEnd, 1);
    }
    best = Math.max(best, runLen);
    cursor = runEnd;
  }
  return best;
}

export interface HabitStatsOptions {
  today?: DateStr;
  /** How many trailing weeks feed the "weekly cost of lunch" average. Default 8. */
  lunchWeeks?: number;
}

export function computeHabitStats(txns: Txn[], categories: Category[], options: HabitStatsOptions = {}): HabitStats {
  // Local-calendar-day default (CONTRACTS.md §3 dates are local, not UTC) — see
  // detect.ts's DEFAULT_OPTIONS.today for why `toISOString()` here would be wrong
  // for the first ~10-11 hours of every Australian day.
  const today = options.today ?? todayStr();
  const lunchWeeks = options.lunchWeeks ?? 8;
  const thisMonth = monthOf(today);
  const lastMonth = prevMonth(thisMonth);

  const spendTxns = txns.filter((t) => !t.excluded);
  const totals = dailyTotals(spendTxns);
  const earliestDate = spendTxns.reduce<DateStr | null>(
    (min, t) => (min === null || t.date < min ? t.date : min),
    null
  );

  const noSpendStreak = streakEndingAt(totals, today, earliestDate);
  const bestNoSpendStreak = earliestDate ? Math.max(bestStreak(totals, earliestDate, today), noSpendStreak) : 0;

  const coffeeCategory = findCategory(categories, 'coffee');
  const coffeeTxns = coffeeCategory ? spendTxns.filter((t) => t.categoryId === coffeeCategory.id && t.amountCents > 0) : [];
  const coffeesThisMonth = coffeeTxns.filter((t) => monthOf(t.date) === thisMonth).length;
  const coffeesLastMonth = coffeeTxns.filter((t) => monthOf(t.date) === lastMonth).length;
  const coffeeSpendCents = coffeeTxns
    .filter((t) => monthOf(t.date) === thisMonth)
    .reduce((s, t) => s + t.amountCents, 0);

  const lunchCategory = findCategory(categories, 'lunch');
  const lunchCutoff = addDaysUTC(today, -7 * lunchWeeks);
  const lunchSpend = lunchCategory
    ? spendTxns
        .filter((t) => t.categoryId === lunchCategory.id && t.amountCents > 0 && t.date >= lunchCutoff)
        .reduce((s, t) => s + t.amountCents, 0)
    : 0;
  const lunchSpendPerWeekCents = Math.round(lunchSpend / lunchWeeks);

  const diningCategory = findCategory(categories, 'dining') ?? findCategory(categories, 'eating out') ?? findCategory(categories, 'restaurant');
  const diningOutThisMonthCents = diningCategory
    ? spendTxns
        .filter((t) => t.categoryId === diningCategory.id && t.amountCents > 0 && monthOf(t.date) === thisMonth)
        .reduce((s, t) => s + t.amountCents, 0)
    : 0;

  return {
    noSpendStreak,
    bestNoSpendStreak,
    coffeesThisMonth,
    coffeesLastMonth,
    coffeeSpendCents,
    lunchSpendPerWeekCents,
    diningOutThisMonthCents,
  };
}

/** Last N days of net spend, oldest first — feeds the no-spend-streak sparkline. */
export function recentSpendSeries(txns: Txn[], days: number, today: DateStr): { date: DateStr; cents: Cents }[] {
  const totals = dailyTotals(txns.filter((t) => !t.excluded));
  const out: { date: DateStr; cents: Cents }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysUTC(today, -i);
    out.push({ date, cents: Math.max(0, totals.get(date) ?? 0) });
  }
  return out;
}
