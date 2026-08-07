import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useRecurringSync } from '@/features/recurring';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';

const TITLES: Record<string, string> = {
  '/': 'Tally',
  '/log': 'Log',
  '/trends': 'Trends',
  '/more': 'More',
  '/import': 'Import',
  '/budgets': 'Budgets',
  '/settings': 'Settings',
  '/goal': 'Deposit goal',
  '/routine': 'Routine',
  '/recurring': 'Recurring',
  '/habits': 'Habits',
  '/transactions': 'Transactions',
};

/**
 * App shell layout: top bar + scrollable content + bottom tab bar. Mounted once around
 * every route via a layout `<Route>` — screens only render their own body.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Tally';
  const mainRef = useRef<HTMLElement>(null);

  // Detect recurring series here, at the shell, rather than inside any one screen.
  // Safe-to-Spend reserves upcoming bills out of the daily allowance, and it reads
  // that list from the store. When the sync only ran on the Log screen, a user who
  // opened the app straight to Home saw "$0.00 bills" and an allowance that had
  // reserved nothing for rent — overstating what was genuinely safe to spend.
  useRecurringSync();

  // The scrollable <main> is mounted once for the whole shell (only its Outlet content
  // swaps per route), so its scroll position otherwise carries over between screens —
  // navigating from a scrolled-down list straight into a new screen would open it
  // already scrolled past its own top content. Reset on every route change instead.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar title={title} />
      <main
        ref={mainRef}
        className="scroll-container flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
