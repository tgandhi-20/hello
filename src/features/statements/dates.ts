/**
 * Statements feature — local calendar-day arithmetic for day-of-month cycle math
 * (closing day, due day, "next occurrence of the Nth"). CONTRACTS.md §3: dates
 * are `YYYY-MM-DD` LOCAL strings — this module never touches `Date.parse` or
 * `toISOString`, which read UTC and can silently shift the calendar day for an
 * Australian user (see `src/features/recurring/detect.ts` and
 * `src/features/routine/dates.ts`, which document the same trap and this
 * module follows their precedent).
 *
 * Two techniques are used, deliberately:
 *  - Month/day roll-forward (`addMonthsClamped`, `nextOnOrAfter`, `nextAfter`)
 *    is pure integer arithmetic on (year, month, day) triples — no `Date`
 *    object at all, so it is entirely immune to DST and needs no special
 *    case for a Dec→Jan (or Jan→Dec) crossing; it's just an ordinary carry.
 *  - Day-count differences (`diffDaysLocal`) use `Date.UTC(y, m-1, d)` as a
 *    pure calendar-arithmetic trick (treating the numbers as an abstract
 *    calendar, not a real instant) — the same technique `recurring/detect.ts`
 *    already uses, safe specifically because the result is only ever a day
 *    *count*, never displayed or re-parsed as a timestamp.
 *
 * Pure, no store access — easy to check in isolation.
 */
import type { DateStr, MonthStr } from '@/types';
import { daysInMonth } from '@/ui/format';

const pad2 = (n: number): string => String(n).padStart(2, '0');

function splitDate(d: DateStr): { year: number; month: number; day: number } {
  const [year, month, day] = d.split('-').map(Number);
  return { year, month, day };
}

/** Day-of-month (1–31) of a `DateStr`. */
export function dayOfMonthOf(d: DateStr): number {
  return splitDate(d).day;
}

function daysInMonthOf(year: number, month: number): number {
  return daysInMonth(`${year}-${pad2(month)}` as MonthStr);
}

/**
 * Build a `DateStr` for `day` in `year`-`month`, clamping into the month's real
 * range so a configured "31st" never overflows a short month (matches
 * `routine/dates.ts`'s `nthDayOfMonth` clamping behaviour).
 */
export function dateFromParts(year: number, month: number, day: number): DateStr {
  const clampedDay = Math.min(Math.max(1, Math.round(day)), daysInMonthOf(year, month));
  return `${year}-${pad2(month)}-${pad2(clampedDay)}`;
}

/**
 * `d` shifted by whole calendar months (positive or negative), keeping the same
 * day-of-month where the target month is long enough, clamped otherwise (31 Jan
 * + 1 month → 28/29 Feb, never a rollover into March).
 */
export function addMonthsClamped(d: DateStr, months: number): DateStr {
  const { year, month, day } = splitDate(d);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  return dateFromParts(newYear, newMonth, day);
}

/** The earliest date >= `fromInclusive` whose day-of-month is `dayOfMonth` (clamped per month). */
export function nextOnOrAfter(fromInclusive: DateStr, dayOfMonth: number): DateStr {
  const { year, month } = splitDate(fromInclusive);
  const candidate = dateFromParts(year, month, dayOfMonth);
  return candidate >= fromInclusive ? candidate : addMonthsClamped(candidate, 1);
}

/** The earliest date strictly after `fromExclusive` whose day-of-month is `dayOfMonth`. */
export function nextAfter(fromExclusive: DateStr, dayOfMonth: number): DateStr {
  const candidate = nextOnOrAfter(fromExclusive, dayOfMonth);
  return candidate > fromExclusive ? candidate : addMonthsClamped(candidate, 1);
}

/** The latest date <= `fromInclusive` whose day-of-month is `dayOfMonth` (clamped per month). */
export function previousOnOrBefore(fromInclusive: DateStr, dayOfMonth: number): DateStr {
  const { year, month } = splitDate(fromInclusive);
  const candidate = dateFromParts(year, month, dayOfMonth);
  return candidate <= fromInclusive ? candidate : addMonthsClamped(candidate, -1);
}

/** The latest date strictly before `fromExclusive` whose day-of-month is `dayOfMonth`. */
export function previousBefore(fromExclusive: DateStr, dayOfMonth: number): DateStr {
  const candidate = previousOnOrBefore(fromExclusive, dayOfMonth);
  return candidate < fromExclusive ? candidate : addMonthsClamped(candidate, -1);
}

/** `b - a` in whole days (local calendar days — see file header for why `Date.UTC` is safe here). */
export function diffDaysLocal(a: DateStr, b: DateStr): number {
  const pa = splitDate(a);
  const pb = splitDate(b);
  const ua = Date.UTC(pa.year, pa.month - 1, pa.day);
  const ub = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((ub - ua) / 86_400_000);
}
