/**
 * Small month-arithmetic helpers shared across Agent 5's screens (dashboard, budgets,
 * insights all need "which month", "next/prev month", "days elapsed/remaining"). Lives
 * here because the calendar heatmap and trends screen lean on it hardest; the dashboard
 * and budgets screens import it directly since all four live under Agent 5's ownership.
 *
 * Pure functions only — no store access, nothing here mutates or reads global state.
 */
import type { DateStr, MonthStr } from '@/types';
import { daysInMonth, todayStr } from '@/ui/format';

const LOCALE = 'en-AU';
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat(LOCALE, { month: 'short' });

/** The `YYYY-MM` MonthStr for today, in local time. */
export function currentMonth(): MonthStr {
  return todayStr().slice(0, 7);
}

export function prevMonth(month: MonthStr): MonthStr {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(month: MonthStr): MonthStr {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `"August 2026"` */
export function monthLabel(month: MonthStr): string {
  const [y, m] = month.split('-').map(Number);
  return MONTH_YEAR.format(new Date(y, m - 1, 1));
}

/** `"Aug"` — used for compact column-chart axis labels. */
export function monthShortLabel(month: MonthStr): string {
  const [y, m] = month.split('-').map(Number);
  return MONTH_SHORT.format(new Date(y, m - 1, 1));
}

export function isCurrentMonth(month: MonthStr): boolean {
  return month === currentMonth();
}

/**
 * Days elapsed so far in `month`, counting today as elapsed. For a past month this is
 * the full month length; for a future month it's 0 (guarded, never negative).
 */
export function daysElapsedInMonth(month: MonthStr): number {
  const total = daysInMonth(month);
  if (month < currentMonth()) return total;
  if (month > currentMonth()) return 0;
  return Number(todayStr().slice(8, 10));
}

/**
 * Days remaining in `month`, counting today as remaining (i.e. "today included").
 * Always >= 1 for the current month so a same-day divide is never by zero.
 */
export function daysRemainingInMonth(month: MonthStr): number {
  const total = daysInMonth(month);
  if (month > currentMonth()) return total;
  if (month < currentMonth()) return 0;
  const today = Number(todayStr().slice(8, 10));
  return Math.max(1, total - today + 1);
}

/** Monday-first weekday index for a DateStr: 0=Mon, 1=Tue, … 6=Sun (Australian convention). */
export function mondayIndex(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

export const WEEKDAY_LABELS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
