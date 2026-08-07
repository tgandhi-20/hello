import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useRecurringSync } from '@/features/recurring';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { UpdateBanner } from '@/ui/UpdateAvailable';
import { useRequestPersistentStorage } from '@/ui/storage';
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
  '/statements': 'Statements',
};

/**
 * App shell layout: top bar + scrollable content + bottom tab bar. Mounted once around
 * every route via a layout `<Route>` — screens only render their own body.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Tally';
  const mainRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  const isFirstRender = useRef(true);

  // Detect recurring series here, at the shell, rather than inside any one screen.
  // Safe-to-Spend reserves upcoming bills out of the daily allowance, and it reads
  // that list from the store. When the sync only ran on the Log screen, a user who
  // opened the app straight to Home saw "$0.00 bills" and an allowance that had
  // reserved nothing for rent — overstating what was genuinely safe to spend.
  useRecurringSync();

  // `AppShell` only mounts once `LockGate` has let the user past the PIN/passphrase
  // screen — i.e. exactly "after first successful unlock", never on first paint,
  // which is what the persistence request needs (see storage.ts's doc comment).
  useRequestPersistentStorage(true);

  // The scrollable <main> is mounted once for the whole shell (only its Outlet content
  // swaps per route), so its scroll position otherwise carries over between screens —
  // navigating from a scrolled-down list straight into a new screen would open it
  // already scrolled past its own top content. Reset on every route change instead.
  //
  // Also moves focus to the new screen's heading and announces it via a polite live
  // region, so a screen-reader user gets a clear signal that navigation happened (a
  // 5-tab mobile app has no meaningful "skip to content" affordance to build instead).
  // Skipped on the very first render — the initial screen doesn't need an
  // announcement, and stealing focus on first paint would be actively unhelpful.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    setRouteAnnouncement(`${title} screen`);
  }, [pathname, title]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar ref={headingRef} title={title} />
      <UpdateBanner />
      {/* Polite live region for route-change announcements — see the effect above.
          Visually hidden; screen readers only. */}
      <div aria-live="polite" className="sr-only">
        {routeAnnouncement}
      </div>
      <main
        ref={mainRef}
        className="scroll-container flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}
      >
        {/* Per-screen boundary: a render bug in one screen shows a calm rescue
            screen in its place without taking out this shell's top bar / tab bar.
            `key={pathname}` is deliberate and load-bearing: AppShell itself never
            unmounts between routes (only Outlet's child swaps), so without a key
            forcing a fresh instance, a boundary that already caught an error on
            one screen would keep showing that same stale fallback forever, even
            after navigating to a completely unrelated, healthy screen — trapping
            the user instead of letting the tab bar be the working escape hatch it
            visually promises. */}
        <ErrorBoundary key={pathname} label={title}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <TabBar />
    </div>
  );
}
