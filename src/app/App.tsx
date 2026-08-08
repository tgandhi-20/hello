import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/ui/Toast';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ServiceWorkerRegistrar } from '@/ui/UpdateAvailable';
import { LockGate } from '@/security/LockScreen';
import { GlobalRuntimeGuard } from './GlobalRuntimeGuard';
import { AppShell } from './shell/AppShell';
import { TodayScreen } from './screens/TodayScreen';
import { SpendingScreen } from './screens/SpendingScreen';
import { PlanScreen } from './screens/PlanScreen';
import { LogScreen } from './screens/LogScreen';
import { TrendsScreen } from './screens/TrendsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { ImportScreen } from './screens/ImportScreen';
import { BudgetsScreen } from './screens/BudgetsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { GoalScreen } from './screens/GoalScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { RecurringScreen } from './screens/RecurringScreen';
import { HabitsScreen } from './screens/HabitsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { StatementsScreen } from './screens/StatementsScreen';

/**
 * HashRouter is deliberate (CONTRACTS.md §1): bulletproof on a GitHub Pages subpath and
 * gives the Android hardware back button sane behaviour for free — don't switch to
 * BrowserRouter.
 *
 * IA (DESIGN-V3.md §4): 5 tabs — Today (this file's `/`), Spending ("what happened"),
 * quick-add (`/log`, the centre FAB), Plan ("what's planned"), More. Spending and Plan
 * are container screens (`SpendingScreen`/`PlanScreen`) that host the existing feature
 * screens other agents own as nested routes/tabs — those screens are imported and
 * mounted unmodified, never rewritten. Every OLD top-level path
 * (`/transactions`, `/trends`, `/habits`, `/goal`, `/budgets`, `/recurring`,
 * `/statements`, `/routine`) still resolves — via a `Navigate` redirect into its new
 * home under `/spending/*` or `/plan/*` — so nothing that used to work 404s, and any
 * bookmark or deep link from before this restructure keeps working.
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

                {/* Spending — "what happened": transactions, trends/heatmap, habits. */}
                <Route path="/spending" element={<SpendingScreen />}>
                  <Route index element={<Navigate to="transactions" replace />} />
                  <Route path="transactions" element={<TransactionsScreen />} />
                  <Route path="trends" element={<TrendsScreen />} />
                  <Route path="habits" element={<HabitsScreen />} />
                </Route>

                {/* Plan — "what's planned": goal, budgets, recurring, statements, routine. */}
                <Route path="/plan" element={<PlanScreen />}>
                  <Route index element={<Navigate to="goal" replace />} />
                  <Route path="goal" element={<GoalScreen />} />
                  <Route path="budgets" element={<BudgetsScreen />} />
                  <Route path="recurring" element={<RecurringScreen />} />
                  <Route path="statements" element={<StatementsScreen />} />
                  <Route path="routine" element={<RoutineScreen />} />
                </Route>

                <Route path="/log" element={<LogScreen />} />
                <Route path="/more" element={<MoreScreen />} />
                <Route path="/import" element={<ImportScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />

                {/* Legacy paths — kept working via redirect (DESIGN-V3.md §4). */}
                <Route path="/transactions" element={<Navigate to="/spending/transactions" replace />} />
                <Route path="/trends" element={<Navigate to="/spending/trends" replace />} />
                <Route path="/habits" element={<Navigate to="/spending/habits" replace />} />
                <Route path="/goal" element={<Navigate to="/plan/goal" replace />} />
                <Route path="/budgets" element={<Navigate to="/plan/budgets" replace />} />
                <Route path="/recurring" element={<Navigate to="/plan/recurring" replace />} />
                <Route path="/statements" element={<Navigate to="/plan/statements" replace />} />
                <Route path="/routine" element={<Navigate to="/plan/routine" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </LockGate>
        </ErrorBoundary>
      </ToastProvider>
    </HashRouter>
  );
}
