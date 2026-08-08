import React from 'react';
import { Outlet } from 'react-router-dom';
import { SectionTabs } from '../shell/SectionTabs';

const TABS = [
  { to: '/spending/transactions', label: 'Transactions' },
  { to: '/spending/trends', label: 'Trends' },
  { to: '/spending/habits', label: 'Habits' },
];

/**
 * Spending — "what happened" (DESIGN-V3.md §4). Container screen hosting the
 * transactions, trends/heatmap and habits feature screens as tabs; those
 * screens are owned by other agents and imported here unmodified, wired up
 * as nested routes in `src/app/App.tsx`.
 */
export function SpendingScreen() {
  return (
    <div className="flex flex-col">
      <SectionTabs tabs={TABS} ariaLabel="Spending sections" />
      <Outlet />
    </div>
  );
}
