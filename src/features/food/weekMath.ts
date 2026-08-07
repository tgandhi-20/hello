/**
 * Monday-start week arithmetic (PERSONAL.md §4 — "Week runs Monday-Sunday (AU)").
 * Pure `DateStr` string arithmetic via `addDays`/local `Date` — no UTC parsing traps
 * (see src/ui/format.ts's own warning about `new Date(dateStr)`).
 *
 * Kept local to src/features/food rather than reusing the Monday-index helper that
 * already exists in src/features/insights/monthMath.ts, so this feature's week-boundary
 * logic — the thing its whole check suite exists to pin down — has one definition to
 * read and test, not two call sites to keep in sync across feature directories.
 */
import type { DateStr } from '@/types';
import { addDays } from '@/ui/format';

/** Monday-first weekday index for a DateStr: 0=Mon, 1=Tue, … 6=Sun. */
export function mondayIndexOf(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

export interface WeekWindow {
  /** Monday of the week containing `date`. */
  weekStart: DateStr;
  /** Sunday of the week containing `date`. */
  weekEnd: DateStr;
  /** `date`'s position within its week: 0=Mon … 6=Sun. */
  dayIndex: number;
  /** Days elapsed so far this week, `date` counted as elapsed. Always 1..7. */
  daysElapsed: number;
  /** Days left in the week, `date` counted as remaining. Always 1..7, never 0 —
   *  mirrors `daysRemainingInMonth`'s "today included" convention so a same-day
   *  divide is never by zero. */
  daysLeft: number;
}

/** The Monday-Sunday week window containing `date`. */
export function weekWindowFor(date: DateStr): WeekWindow {
  const dayIndex = mondayIndexOf(date);
  const weekStart = addDays(date, -dayIndex);
  const weekEnd = addDays(weekStart, 6);
  return {
    weekStart,
    weekEnd,
    dayIndex,
    daysElapsed: dayIndex + 1,
    daysLeft: 7 - dayIndex,
  };
}

/** The Monday-Sunday bounds of the week immediately before the one starting `weekStart`. */
export function previousWeekBounds(weekStart: DateStr): { weekStart: DateStr; weekEnd: DateStr } {
  const prevStart = addDays(weekStart, -7);
  return { weekStart: prevStart, weekEnd: addDays(prevStart, 6) };
}

/** Whether `date` falls within `[weekStart, weekEnd]` inclusive. Safe on `YYYY-MM-DD` strings
 *  because that format sorts lexicographically the same as chronologically. */
export function isInWeek(date: DateStr, weekStart: DateStr, weekEnd: DateStr): boolean {
  return date >= weekStart && date <= weekEnd;
}
