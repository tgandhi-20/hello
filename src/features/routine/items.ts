/**
 * The routine's item definitions and per-month resolution — PERSONAL.md §8.
 *
 * Salary/transfer days come from `Settings.paydayDayOfMonth` (already a frozen store
 * field, default 15th) rather than a hardcoded "15th" — the transfer is modelled as
 * "the day after payday" so it tracks a changed payday automatically. The Amex due day
 * comes from `Settings.amexDueDayOfMonth` (this feature's own augmentation, see
 * `types.ts`) defaulting to `DEFAULT_AMEX_DUE_DAY_OF_MONTH`. Last-business-day and
 * first-Saturday are computed, never hardcoded (`dates.ts`).
 *
 * Pure functions only — no store access, so `__checks__/run.ts` can exercise this
 * directly.
 */
import type { MonthStr, Settings } from '@/types';
import { addDays } from '@/ui/format';
import { PLAN_DEFAULTS } from '@/personal/plan';
import { lastBusinessDayOfMonth, firstSaturdayOfMonth, nthDayOfMonth } from './dates';
import { DEFAULT_AMEX_DUE_DAY_OF_MONTH } from './planExtras';
import type {
  MonthlyRoutineItemId,
  RoutineItemDef,
  RoutineMonthState,
  ResolvedRoutineItem,
  ResolvedMonthlyRoutineItem,
} from './types';

export const ROUTINE_ITEM_DEFS: readonly RoutineItemDef[] = [
  {
    id: 'salary',
    label: 'Salary lands',
    detail: 'Net pay hits the everyday account.',
  },
  {
    id: 'transfer-savings',
    label: 'Transfer to savings',
    detail: 'Pay yourself first — move the savings amount before anything else touches it.',
  },
  {
    id: 'last-business-day',
    label: 'Confirm savings closed higher',
    detail:
      "Check this month's Bankwest balance beat last month's — that's what keeps the bonus rate.",
  },
  {
    id: 'first-saturday',
    label: 'Export & review statements',
    detail: 'CBA, Amex and Bankwest CSVs, checked against budget.',
  },
  {
    id: 'pay-amex',
    label: 'Pay Amex in full',
    detail: 'Never carry a balance — see the Amex reminder below.',
  },
] as const;

function defOf(id: MonthlyRoutineItemId): RoutineItemDef {
  const def = ROUTINE_ITEM_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown routine item id: ${id}`);
  return def;
}

type RoutineSettingsSlice = Pick<Settings, 'paydayDayOfMonth' | 'amexDueDayOfMonth' | 'transferToSavingsDayOfMonth'>;

/** Due-date rule for each monthly item, given the settings that make some of them configurable. */
export function dueDateFor(id: MonthlyRoutineItemId, month: MonthStr, settings: RoutineSettingsSlice): string {
  switch (id) {
    case 'salary':
      return nthDayOfMonth(month, settings.paydayDayOfMonth || PLAN_DEFAULTS.paydayDayOfMonth);
    case 'transfer-savings':
      return nthDayOfMonth(month, settings.transferToSavingsDayOfMonth ?? PLAN_DEFAULTS.autoTransferDayOfMonth);
    case 'last-business-day':
      return lastBusinessDayOfMonth(month);
    case 'first-saturday':
      return firstSaturdayOfMonth(month);
    case 'pay-amex':
      return nthDayOfMonth(month, settings.amexDueDayOfMonth ?? DEFAULT_AMEX_DUE_DAY_OF_MONTH);
  }
}

/** Resolve every monthly item for `month` against `monthState` and `today`, soonest-due first. */
export function resolveMonthlyItems(
  month: MonthStr,
  settings: RoutineSettingsSlice,
  monthState: RoutineMonthState,
  today: string
): ResolvedMonthlyRoutineItem[] {
  const items = ROUTINE_ITEM_DEFS.map((def) => {
    const dueDate = dueDateFor(def.id, month, settings);
    const done = Boolean(monthState.done[def.id]);
    return {
      id: def.id,
      label: def.label,
      detail: def.detail,
      dueDate,
      done,
      overdue: !done && dueDate < today,
    };
  });
  return items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/** The daily "log spending" item, resolved against whether today's date has been ticked. */
export function resolveDailyItem(monthState: RoutineMonthState, today: string): ResolvedRoutineItem {
  return {
    id: 'daily-log',
    label: 'Log spending',
    detail: 'A few taps as it happens beats reconstructing it from a statement in five weeks.',
    dueDate: today,
    done: monthState.dailyLogDates.includes(today),
    overdue: false, // a fresh "due" every day by design — "overdue" would just be noise here
  };
}

/**
 * Items due today or within the next `withinDays` days, not yet done, soonest first.
 * Overdue (past-due, undone) items are always included — their due date is `<= today`,
 * which is `<= horizon` for any non-negative `withinDays`.
 */
export function dueOrSoon<T extends ResolvedRoutineItem>(items: T[], today: string, withinDays: number): T[] {
  const horizon = addDays(today, Math.max(0, withinDays));
  return items.filter((i) => !i.done && i.dueDate <= horizon);
}

export { defOf as routineItemDef };
