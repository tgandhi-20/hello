/**
 * Pure state transitions over `RoutineChecklistState` — rollover into a new month and
 * ticking an item. No store access here; `useRoutineChecklist.ts` is the thin React/
 * store wrapper. Kept pure so `__checks__/run.ts` can exercise "resets on a new month
 * without losing history" directly.
 */
import type { MonthStr } from '@/types';
import { monthOf } from '@/ui/format';
import type { MonthlyRoutineItemId, RoutineChecklistState, RoutineMonthState } from './types';

/** How many past months' checklist state to keep. A year of history is plenty — this is
 * a small tick-state map, not transaction history, and doesn't need to grow forever. */
const MAX_HISTORY_MONTHS = 12;

function emptyMonthState(): RoutineMonthState {
  return { done: {}, dailyLogDates: [] };
}

export function emptyChecklistState(today: string): RoutineChecklistState {
  return { currentMonth: monthOf(today), current: emptyMonthState(), history: {} };
}

function capHistory(history: Record<MonthStr, RoutineMonthState>): Record<MonthStr, RoutineMonthState> {
  const months = Object.keys(history).sort(); // YYYY-MM sorts lexicographically = chronologically
  if (months.length <= MAX_HISTORY_MONTHS) return history;
  const keep = new Set(months.slice(months.length - MAX_HISTORY_MONTHS));
  const out: Record<MonthStr, RoutineMonthState> = {};
  for (const m of months) {
    if (keep.has(m)) out[m] = history[m];
  }
  return out;
}

/**
 * Bring `state` up to date for `today`'s month. If `state` is undefined (never used the
 * checklist before), starts fresh. If the current month has already rolled over, the
 * outgoing month's tick state is archived into `history` (never dropped) and `current`
 * resets to a clean, all-undone bucket for the new month — this is the "resets each
 * month without losing history" behaviour PERSONAL.md §8 and the deliverable both ask
 * for. A no-op (returns `state` unchanged, same reference) when nothing needs to change,
 * so callers can safely call this on every render without extra writes.
 */
export function rolloverIfNeeded(state: RoutineChecklistState | undefined, today: string): RoutineChecklistState {
  const month = monthOf(today);
  if (!state) return emptyChecklistState(today);
  if (state.currentMonth === month) return state;

  const history = capHistory({ ...state.history, [state.currentMonth]: state.current });
  return { currentMonth: month, current: emptyMonthState(), history };
}

/** Toggle one monthly item's done flag. Assumes `state.currentMonth` already matches `today`'s month — call `rolloverIfNeeded` first. */
export function toggleMonthlyItem(state: RoutineChecklistState, id: MonthlyRoutineItemId): RoutineChecklistState {
  const nextDone = { ...state.current.done, [id]: !state.current.done[id] };
  return { ...state, current: { ...state.current, done: nextDone } };
}

/** Toggle today's "log spending" tick. Assumes `state.currentMonth` already matches `today`'s month. */
export function toggleDailyLog(state: RoutineChecklistState, today: string): RoutineChecklistState {
  const has = state.current.dailyLogDates.includes(today);
  const dailyLogDates = has
    ? state.current.dailyLogDates.filter((d) => d !== today)
    : [...state.current.dailyLogDates, today].sort();
  return { ...state, current: { ...state.current, dailyLogDates } };
}
