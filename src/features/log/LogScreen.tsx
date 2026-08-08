import React from 'react';
import { QuickAdd } from './QuickAdd';

/**
 * The `/log` route — the centre FAB. DESIGN-V3.md §4: "The ⊕ tab's ONLY job is
 * quick-add." Transactions, Recurring and Habits used to live here as tabs, but
 * they now have real homes under Spending (`/spending/transactions`,
 * `/spending/habits`) and Plan (`/plan/recurring`) — see App.tsx. Keeping a second
 * tab strip here made every one of those screens reachable two competing ways, so
 * it was removed; this screen renders quick-add and nothing else.
 */
export function LogScreen() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-container">
        <QuickAdd />
      </div>
    </div>
  );
}
