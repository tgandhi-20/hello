import React, { useState } from 'react';
import { SegmentedControl } from '@/ui';
import { QuickAdd } from './QuickAdd';
import { TransactionsScreen } from '@/features/transactions';
import { RecurringScreen } from '@/features/recurring';
import { HabitsScreen } from '@/features/habits';

type Tab = 'add' | 'transactions' | 'recurring' | 'habits';

/**
 * The `/log` route. CONTRACTS.md only grants Agent 4 this one screen slot, so
 * Transactions / Recurring / Habits — all owned by this agent — live here as tabs
 * rather than separate routes. Quick-add is always the tab you land on: it's the
 * screen the whole app is built to get you to in under 3 seconds.
 */
export function LogScreen() {
  const [tab, setTab] = useState<Tab>('add');
  // Recurring detection now runs once in AppShell, so it stays current no matter which
  // route the user opens — Home needs it too, to reserve upcoming bills out of
  // Safe-to-Spend. Running it here as well would just duplicate the work.

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-3">
        <SegmentedControl
          options={[
            { value: 'add', label: 'Add' },
            { value: 'transactions', label: 'Transactions' },
            { value: 'recurring', label: 'Recurring' },
            { value: 'habits', label: 'Habits' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-container">
        {tab === 'add' ? <QuickAdd /> : null}
        {tab === 'transactions' ? <TransactionsScreen /> : null}
        {tab === 'recurring' ? <RecurringScreen /> : null}
        {tab === 'habits' ? <HabitsScreen /> : null}
      </div>
    </div>
  );
}
