/**
 * Small date-display helpers local to the goal feature, kept self-contained rather
 * than reaching into another agent's feature directory (e.g. src/features/insights)
 * for the equivalent month-math utilities they maintain for their own screens.
 */
import type { DateStr, MonthStr } from '@/types';
import { todayStr } from '@/ui/format';

const MONTH_YEAR = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('en-AU', { month: 'short', year: '2-digit' });

/** Whole days from today to `dateStr` (can be negative if the date has passed). The
 *  divisor is a fixed ms-per-day constant, not data-dependent, so this never divides
 *  by zero. */
export function daysUntil(dateStr: DateStr): number {
  const today = todayStr();
  const [ty, tm, td] = today.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const a = new Date(ty, tm - 1, td).getTime();
  const b = new Date(dy, dm - 1, dd).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** `"August 2026"` */
export function monthLabel(month: MonthStr): string {
  const [y, m] = month.split('-').map(Number);
  return MONTH_YEAR.format(new Date(y, m - 1, 1));
}

/** `"Aug 26"` — compact, for table rows / axis labels. */
export function monthShortLabel(month: MonthStr): string {
  const [y, m] = month.split('-').map(Number);
  return MONTH_SHORT.format(new Date(y, m - 1, 1));
}
