import React from 'react';
import { Outlet } from 'react-router-dom';
import { SectionTabs } from '../shell/SectionTabs';

const TABS = [
  { to: '/plan/goal', label: 'Goal' },
  { to: '/plan/budgets', label: 'Budgets' },
  { to: '/plan/recurring', label: 'Recurring' },
  { to: '/plan/statements', label: 'Statements' },
  { to: '/plan/routine', label: 'Routine' },
];

/**
 * Plan — "what's planned" (DESIGN-V3.md §4). Container screen hosting the
 * goal, budgets, recurring, statements and routine feature screens as tabs;
 * those screens are owned by other agents and imported here unmodified,
 * wired up as nested routes in `src/app/App.tsx`.
 */
export function PlanScreen() {
  return (
    <div className="flex flex-col">
      <SectionTabs tabs={TABS} ariaLabel="Plan sections" />
      <Outlet />
    </div>
  );
}
