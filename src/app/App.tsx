import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/ui/Toast';
import { LockGate } from '@/security/LockScreen';
import { AppShell } from './shell/AppShell';
import { HomeScreen } from './screens/HomeScreen';
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

/**
 * HashRouter is deliberate (CONTRACTS.md §1): bulletproof on a GitHub Pages subpath and
 * gives the Android hardware back button sane behaviour for free — don't switch to
 * BrowserRouter.
 *
 * LockGate wraps the entire routed tree, not individual screens. Nothing that reads
 * decrypted data may render outside it — that is what makes the encryption actually
 * take effect rather than merely exist. It sits inside ToastProvider so the lock and
 * PIN-setup screens can raise toasts.
 */
export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <LockGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/log" element={<LogScreen />} />
              <Route path="/trends" element={<TrendsScreen />} />
              <Route path="/more" element={<MoreScreen />} />
              <Route path="/import" element={<ImportScreen />} />
              <Route path="/budgets" element={<BudgetsScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/goal" element={<GoalScreen />} />
              <Route path="/routine" element={<RoutineScreen />} />
              <Route path="/recurring" element={<RecurringScreen />} />
              <Route path="/habits" element={<HabitsScreen />} />
              <Route path="/transactions" element={<TransactionsScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </LockGate>
      </ToastProvider>
    </HashRouter>
  );
}
