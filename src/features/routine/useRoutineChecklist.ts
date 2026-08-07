/**
 * React/store glue for the routine checklist. Persists through `useStore`'s frozen §9
 * API only (`settings` + `updateSettings`) — never IndexedDB or crypto directly, per
 * the module's brief. All the actual state logic lives in `state.ts` (pure, checked).
 */
import { useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { todayStr } from '@/ui/format';
import { rolloverIfNeeded, toggleMonthlyItem, toggleDailyLog } from './state';
import type { MonthlyRoutineItemId, RoutineChecklistState } from './types';

export interface UseRoutineChecklistResult {
  state: RoutineChecklistState;
  today: string;
  toggleItem: (id: MonthlyRoutineItemId) => void;
  toggleLoggedToday: () => void;
}

export function useRoutineChecklist(): UseRoutineChecklistResult {
  const hydrated = useStore((s) => s.hydrated);
  const lockState = useStore((s) => s.lockState);
  const rawState = useStore((s) => s.settings.routineChecklist);
  const updateSettings = useStore((s) => s.updateSettings);
  const today = todayStr();

  const rolled = useMemo(() => rolloverIfNeeded(rawState, today), [rawState, today]);
  const canWrite = hydrated && lockState === 'unlocked';

  // Persist the rollover itself (archiving last month, starting a clean bucket) the
  // first time it's computed for a new month — not on every render, and never while
  // locked/unhydrated (updateSettings would throw with no key to encrypt under).
  useEffect(() => {
    if (!canWrite) return;
    if (rawState?.currentMonth === rolled.currentMonth) return;
    void updateSettings({ routineChecklist: rolled });
  }, [canWrite, rawState, rolled, updateSettings]);

  function toggleItem(id: MonthlyRoutineItemId): void {
    if (!canWrite) return;
    void updateSettings({ routineChecklist: toggleMonthlyItem(rolled, id) });
  }

  function toggleLoggedToday(): void {
    if (!canWrite) return;
    void updateSettings({ routineChecklist: toggleDailyLog(rolled, today) });
  }

  return { state: rolled, today, toggleItem, toggleLoggedToday };
}
