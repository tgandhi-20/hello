/**
 * Shared store-reading hook for the statements feature's components — keeps
 * `StatementsCard` (dashboard) and `StatementsScreen` (full view) computing
 * the same numbers the same way, rather than two components quietly
 * re-deriving cycle/balance/cashflow logic slightly differently.
 */
import { useMemo } from 'react';
import type { AccountId } from '@/types';
import { useStore } from '@/store/useStore';
import { todayStr } from '@/ui/format';
import { effectiveCycle, type CycleInference } from './cycle';
import { computeCurrentCycleBalance, type CurrentCycleBalance } from './balance';
import { buildCashflowCalendar, type CashflowSummary } from './upcoming';
import { CARD_ACCOUNT_IDS } from './types';

export interface StatementsOverview {
  today: string;
  hydrated: boolean;
  cycles: Partial<Record<AccountId, CycleInference>>;
  balances: Partial<Record<AccountId, CurrentCycleBalance>>;
  cashflow: CashflowSummary;
  /** Whether any card account has ANY transaction history at all — drives the empty state. */
  hasAnyCardData: boolean;
}

export function useStatementsOverview(horizonDays = 60): StatementsOverview {
  const hydrated = useStore((s) => s.hydrated);
  const txns = useStore((s) => s.txns);
  const recurring = useStore((s) => s.recurring);
  const settings = useStore((s) => s.settings);

  return useMemo<StatementsOverview>(() => {
    const today = todayStr();
    const cycles: Partial<Record<AccountId, CycleInference>> = {};
    const balances: Partial<Record<AccountId, CurrentCycleBalance>> = {};

    for (const accountId of CARD_ACCOUNT_IDS) {
      const cycle = effectiveCycle(txns, accountId, settings.statementCycles, today);
      cycles[accountId] = cycle;
      balances[accountId] = computeCurrentCycleBalance(txns, recurring, accountId, cycle, today);
    }

    const cashflow = buildCashflowCalendar(txns, recurring, settings, cycles, { today, horizonDays });
    const hasAnyCardData = CARD_ACCOUNT_IDS.some((id) => txns.some((t) => t.account === id));

    return { today, hydrated, cycles, balances, cashflow, hasAnyCardData };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, txns, recurring, settings, horizonDays]);
}
