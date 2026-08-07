/**
 * Routine date math — CONTRACTS.md §3: dates are `YYYY-MM-DD` LOCAL strings, never a UTC
 * timestamp. Every function here takes and returns a `DateStr`/`MonthStr` and does its
 * weekday arithmetic via `new Date(year, monthIndex, day)` (a *local* constructor call,
 * matching `src/ui/format.ts`'s `toLocalDate`) rather than `Date.parse`/`toISOString`,
 * which read UTC and would silently shift the calendar day for an Australian user for
 * the first ~10-11 hours of every local day. That exact bug was already fixed once in
 * this codebase (see `src/features/recurring/detect.ts`'s comment on `DEFAULT_OPTIONS`)
 * — nothing in this module may reintroduce it.
 *
 * Pure, no store access — easy to check in isolation (see `__checks__/run.ts`).
 */
import type { DateStr, MonthStr } from '@/types';
import { addDays, daysInMonth, startOfMonth, endOfMonth } from '@/ui/format';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 0=Sunday … 6=Saturday, matching `Date.prototype.getDay()`, computed from local parts. */
function dayOfWeek(d: DateStr): number {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).getDay();
}

/**
 * Australian weekend only — Saturday or Sunday. This deliberately does NOT know about
 * public holidays (NSW or otherwise): PERSONAL.md §8's "last business day" guard asks
 * for weekend-awareness only, and the app has no holiday calendar to consult. Every
 * caller-facing surface that uses this must say so, rather than imply a more complete
 * "business day" than this actually computes.
 */
export function isWeekend(d: DateStr): boolean {
  const dow = dayOfWeek(d);
  return dow === 0 || dow === 6;
}

/**
 * The last Australian business day of `month` — the last calendar day, walked backwards
 * over Saturday/Sunday. Public holidays are NOT considered (see `isWeekend`'s doc
 * comment) — callers must be explicit about that gap rather than imply the app verified
 * a bank-processing day.
 */
export function lastBusinessDayOfMonth(month: MonthStr): DateStr {
  let d = endOfMonth(month);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** The first Saturday of `month` — walks forward from the 1st until it lands on a Saturday. */
export function firstSaturdayOfMonth(month: MonthStr): DateStr {
  let d = startOfMonth(month);
  while (dayOfWeek(d) !== 6) d = addDays(d, 1);
  return d;
}

/**
 * The `DateStr` for the `day`-th of `month`, clamped into range (1..daysInMonth) so a
 * configured "16th" or "11th" never overflows into next month for a short month, and a
 * non-positive input never underflows into the previous one.
 */
export function nthDayOfMonth(month: MonthStr, day: number): DateStr {
  const clamped = Math.min(Math.max(1, Math.round(day)), daysInMonth(month));
  return `${month}-${pad2(clamped)}`;
}
