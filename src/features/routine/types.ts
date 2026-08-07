/**
 * Routine feature types, plus a `Settings` module augmentation.
 *
 * `src/types.ts` is orchestrator-owned and read-only to this feature (frozen per
 * CONTRACTS.md), so the two small, optional fields this feature persists —
 * `routineChecklist` and `amexDueDayOfMonth` — are added via TypeScript's declaration
 * merging instead of an edit to that file. This is additive only: both fields are
 * optional, so the existing `DEFAULT_SETTINGS` object literal in `src/store/useStore.ts`
 * (which this feature also must not touch) stays valid without them, and every other
 * module's `Settings` usage is unaffected. Persistence itself still goes entirely
 * through the frozen §9 store API (`settings` + `updateSettings`) — this file adds no
 * new storage mechanism, just two more properties on the object the store already
 * encrypts and writes as a whole.
 */
import type { DateStr, MonthStr } from '@/types';

declare module '@/types' {
  interface Settings {
    /** This month's + recent prior months' routine checklist tick state. Optional: absent = never used the routine checklist yet. */
    routineChecklist?: RoutineChecklistState;
    /** Day-of-month the Amex statement is due. Optional: absent = use `DEFAULT_AMEX_DUE_DAY_OF_MONTH` (derived from `@/personal/plan`). */
    amexDueDayOfMonth?: number;
    /** Day-of-month the automatic transfer to savings happens. Optional: absent = use `@/personal/plan`'s `PLAN_DEFAULTS.autoTransferDayOfMonth`. */
    transferToSavingsDayOfMonth?: number;
  }
}

/** The five dated (non-daily) routine items, matching PERSONAL.md §8's monthly bullets. */
export type MonthlyRoutineItemId =
  | 'salary'
  | 'transfer-savings'
  | 'last-business-day'
  | 'first-saturday'
  | 'pay-amex';

export type RoutineItemId = MonthlyRoutineItemId | 'daily-log';

/** One calendar month's worth of tick state. */
export interface RoutineMonthState {
  /** Which monthly items have been ticked this month. */
  done: Partial<Record<MonthlyRoutineItemId, boolean>>;
  /** `YYYY-MM-DD` dates within this month that "log spending" was ticked. */
  dailyLogDates: DateStr[];
}

/**
 * Persisted routine checklist state. `current` always tracks `currentMonth`; older
 * months live in `history`, keyed by `YYYY-MM`, so rolling into a new month resets what
 * you see as "due" without erasing the record of what got done in prior months.
 */
export interface RoutineChecklistState {
  currentMonth: MonthStr;
  current: RoutineMonthState;
  history: Record<MonthStr, RoutineMonthState>;
}

export interface RoutineItemDef {
  id: MonthlyRoutineItemId;
  label: string;
  detail: string;
}

/** A routine item resolved against a specific month + today, ready to render. */
export interface ResolvedRoutineItem {
  id: RoutineItemId;
  label: string;
  detail: string;
  dueDate: DateStr;
  done: boolean;
  overdue: boolean;
}

/** Narrower variant for the five monthly items — `id` excludes `'daily-log'`, so callers
 * that only ever handle monthly items (e.g. the tick button) don't need to cast. */
export interface ResolvedMonthlyRoutineItem extends Omit<ResolvedRoutineItem, 'id'> {
  id: MonthlyRoutineItemId;
}
