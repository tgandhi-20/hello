/**
 * Tally — centralised date/number formatting (CONTRACTS.md §3).
 *
 * Every other agent formats money and dates through these functions.
 * `en-AU`, `DD/MM/YYYY`, `$1,234.56`. Nobody hand-rolls `toFixed(2)`.
 *
 * Money is always integer cents. This module never accepts or returns a
 * float dollar amount.
 */
import type { Cents, DateStr, MonthStr } from '@/types';

const LOCALE = 'en-AU';

/** Split a `YYYY-MM-DD` DateStr into numeric parts without any Date/timezone math. */
function splitDateStr(d: DateStr): { year: number; month: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { year: y, month: m, day };
}

/**
 * Build a local (not UTC) `Date` at midnight for a `YYYY-MM-DD` string.
 * Using `new Date(dateStr)` parses as UTC and can shift the calendar day
 * depending on the viewer's timezone — never do that with a DateStr.
 */
function toLocalDate(d: DateStr): Date {
  const { year, month, day } = splitDateStr(d);
  return new Date(year, month - 1, day);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Today as a `YYYY-MM-DD` DateStr, in local time. */
export function todayStr(): DateStr {
  return toDateStr(new Date());
}

/** Convert a `Date` to a local `YYYY-MM-DD` DateStr. */
export function toDateStr(date: Date): DateStr {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Add (or subtract, with a negative count) whole days to a DateStr. */
export function addDays(d: DateStr, count: number): DateStr {
  const date = toLocalDate(d);
  date.setDate(date.getDate() + count);
  return toDateStr(date);
}

export interface FormatMoneyOptions {
  /** Use compact notation for large numbers, e.g. `$12.3k` instead of `$12,345.00`. */
  compact?: boolean;
  /** Force a leading `+` on positive amounts (useful for displaying income as `+$50.00`). */
  showSign?: boolean;
  /** Omit the trailing `.00` on whole-dollar amounts. Ignored when `compact` is set. */
  hideCents?: boolean;
}

/**
 * Format integer cents as an en-AU currency string, e.g. `formatMoney(123456)` → `"$1,234.56"`.
 * Negative cents render with a leading minus: `formatMoney(-500)` → `"-$5.00"`.
 */
export function formatMoney(cents: Cents, opts: FormatMoneyOptions = {}): string {
  const dollars = cents / 100;
  const isWhole = Number.isInteger(dollars);

  const formatter = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'AUD',
    notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: opts.compact ? undefined : opts.hideCents && isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });

  let out = formatter.format(dollars);
  if (opts.showSign && cents > 0) out = `+${out}`;
  return out;
}

export type DateFormatStyle = 'short' | 'medium' | 'long';

/**
 * Format a DateStr for display.
 * - `short`  → `3/8/26`
 * - `medium` (default) → `03/08/2026`
 * - `long`   → `3 August 2026`
 */
export function formatDate(d: DateStr, style: DateFormatStyle = 'medium'): string {
  const { year, month, day } = splitDateStr(d);

  if (style === 'short') {
    return `${day}/${month}/${String(year).slice(-2)}`;
  }
  if (style === 'long') {
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }).format(
      toLocalDate(d)
    );
  }
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

/**
 * Parse an Australian-formatted date string (`DD/MM/YYYY` or `DD/MM/YY`) — as found in
 * CBA/Bankwest/Amex CSV exports — into a `YYYY-MM-DD` DateStr. Two-digit years pivot at
 * 70: `00`-`69` → `2000`-`2069`, `70`-`99` → `1970`-`1999`.
 * Throws if the string isn't a recognisable `DD/MM/YYYY`-family date.
 */
export function parseAuDate(s: string): DateStr {
  const trimmed = s.trim();
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) {
    throw new Error(`parseAuDate: unrecognised date "${s}"`);
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (match[3].length === 2) {
    year = year <= 69 ? 2000 + year : 1900 + year;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`parseAuDate: date out of range "${s}"`);
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const MONTH_SHORT = new Intl.DateTimeFormat(LOCALE, { month: 'short' });

/**
 * Format a DateStr relative to today for compact UI use:
 * `"Today"`, `"Yesterday"`, or `"Mon 3 Aug"` for anything older.
 */
export function formatRelativeDay(d: DateStr): string {
  const today = todayStr();
  if (d === today) return 'Today';
  if (d === addDays(today, -1)) return 'Yesterday';

  const date = toLocalDate(d);
  const weekday = WEEKDAY_SHORT.format(date);
  const month = MONTH_SHORT.format(date);
  return `${weekday} ${date.getDate()} ${month}`;
}

/** Extract the `YYYY-MM` MonthStr a DateStr falls in. */
export function monthOf(d: DateStr): MonthStr {
  return d.slice(0, 7);
}

/** Number of days in a `YYYY-MM` MonthStr, accounting for leap years. */
export function daysInMonth(month: MonthStr): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** First day of a `YYYY-MM` MonthStr as a DateStr, e.g. `"2026-08"` → `"2026-08-01"`. */
export function startOfMonth(month: MonthStr): DateStr {
  return `${month}-01`;
}

/** Last day of a `YYYY-MM` MonthStr as a DateStr. */
export function endOfMonth(month: MonthStr): DateStr {
  return `${month}-${pad2(daysInMonth(month))}`;
}
