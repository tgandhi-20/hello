import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/ui/Toast';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ServiceWorkerRegistrar } from '@/ui/UpdateAvailable';
import { LockGate } from '@/security/LockScreen';
import { GlobalRuntimeGuard } from './GlobalRuntimeGuard';
import { AppShell } from './shell/AppShell';
import { TodayScreen } from './screens/TodayScreen';
import { LogScreen } from './screens/LogScreen';
import { MenuScreen } from './screens/MenuScreen';
import { ImportScreen } from './screens/ImportScreen';
import { BudgetsScreen } from './screens/BudgetsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { GoalScreen } from './screens/GoalScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { RecurringScreen } from './screens/RecurringScreen';
import { HabitsScreen } from './screens/HabitsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { StatementsScreen } from './screens/StatementsScreen';
import { TrendsScreen } from './screens/TrendsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { BackupRestoreScreen } from './screens/BackupRestoreScreen';
import { HelpScreen } from './screens/HelpScreen';

/**
 * HashRouter is deliberate (CONTRACTS.md §1): bulletproof on a GitHub Pages subpath and
 * gives the Android hardware back button sane behaviour for free — don't switch to
 * BrowserRouter.
 *
 * IA (DESIGN-V4.md §2): exactly 3 tabs — Home (this file's `/`), quick-add (`/log`, the
 * centre FAB, untouched), and Menu — a plain labelled list of every other screen. The
 * v3 5-tab structure (Spending/Plan container screens with sub-tab strips) is GONE —
 * every destination that used to live under `/spending/*` or `/plan/*` is now a
 * top-level route, one tap from Menu, no nested tab mazes.
 *
 * Every route that ever worked keeps working:
 *   - The pre-v3 flat paths (`/transactions`, `/goal`, `/budgets`, `/recurring`,
 *     `/statements`, `/routine`, `/trends`, `/habits`) are simply the CANONICAL paths
 *     again now that the containers are gone — nothing to redirect, they just render.
 *   - The v3 nested paths (`/spending/*`, `/plan/*`, and `/spending`/`/plan` themselves)
 *     redirect to the flat canonical path.
 *   - `/more` (the old 5th tab) redirects to `/menu`.
 *
 * Trends and Habits are NOT relisted in Menu (DESIGN-V4.md §3: "Habits/streaks fold
 * into Where it went"; Trends' category breakdown is the same fold — both are views of
 * the one money pool Home now shows directly). Their routes stay mounted directly
 * so a bookmark or an old redirect never 404s, same reasoning as Routine (whose
 * checklist content isn't in the v4 Menu table either) — nothing is deleted, these are
 * simply not re-advertised as their own destination now that Home covers the same
 * ground. See this file's report for the full route table.
 *
 * LockGate wraps the entire routed tree, not individual screens. Nothing that reads
 * decrypted data may render outside it — that is what makes the encryption actually
 * take effect rather than merely exist. It sits inside ToastProvider so the lock and
 * PIN-setup screens can raise toasts.
 *
 * The outer `ErrorBoundary` here is a last-resort catch-all in case LockGate/LockScreen
 * or AppShell itself throws during render — it would otherwise be a genuine blank white
 * screen for an app holding someone's only copy of their financial data. `AppShell`
 * separately wraps just its routed `<Outlet>` in its own boundary, which is the one that
 * actually fires for an ordinary per-screen bug (it catches first, closer to the throw),
 * keeping the top bar / tab bar alive around it. This outer one only matters for a crash
 * in the shell/lock chrome itself.
 *
 * `ServiceWorkerRegistrar` sits here, outside `LockGate`, deliberately — see its own doc
 * comment. The service worker must start registering the moment the app loads, not only
 * once someone has unlocked it, or the lock screen itself could never get cached for
 * offline use before a first unlock.
 */
export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <GlobalRuntimeGuard />
        <ServiceWorkerRegistrar />
        <ErrorBoundary>
          <LockGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<TodayScreen />} />
                <Route path="/log" element={<LogScreen />} />
                <Route path="/menu" element={<MenuScreen />} />

                {/* MONEY */}
                <Route path="/transactions" element={<TransactionsScreen />} />
                <Route path="/budgets" element={<BudgetsScreen />} />
                <Route path="/recurring" element={<RecurringScreen />} />
                <Route path="/statements" element={<StatementsScreen />} />

                {/* SAVING */}
                <Route path="/goal" element={<GoalScreen />} />

                {/* DATA */}
                <Route path="/import" element={<ImportScreen />} />
                <Route path="/review" element={<ReviewScreen />} />
                <Route path="/backup" element={<BackupRestoreScreen />} />

                {/* APP */}
                <Route path="/help" element={<HelpScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />

                {/* Built, demoted, not in the Menu list — folded into Home's own
                    content per DESIGN-V4.md §3 (see this file's doc comment). Kept
                    mounted directly so nothing that ever linked here 404s. */}
                <Route path="/trends" element={<TrendsScreen />} />
                <Route path="/habits" element={<HabitsScreen />} />
                <Route path="/routine" element={<RoutineScreen />} />

                {/* Legacy v3 container paths — redirect to the now-flat canonical path. */}
                <Route path="/spending" element={<Navigate to="/transactions" replace />} />
                <Route path="/spending/transactions" element={<Navigate to="/transactions" replace />} />
                <Route path="/spending/trends" element={<Navigate to="/trends" replace />} />
                <Route path="/spending/habits" element={<Navigate to="/habits" replace />} />
                <Route path="/plan" element={<Navigate to="/goal" replace />} />
                <Route path="/plan/goal" element={<Navigate to="/goal" replace />} />
                <Route path="/plan/budgets" element={<Navigate to="/budgets" replace />} />
                <Route path="/plan/recurring" element={<Navigate to="/recurring" replace />} />
                <Route path="/plan/statements" element={<Navigate to="/statements" replace />} />
                <Route path="/plan/routine" element={<Navigate to="/routine" replace />} />

                {/* Old 5th tab. */}
                <Route path="/more" element={<Navigate to="/menu" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </LockGate>
        </ErrorBoundary>
      </ToastProvider>
    </HashRouter>
  );
}
