import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
};

/**
 * App shell layout: top bar + scrollable content + bottom tab bar. Mounted once around
 * every route via a layout `<Route>` — screens only render their own body.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Tally';

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar title={title} />
      <main className="scroll-container flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
