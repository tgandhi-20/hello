import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { txnsForMonth, totalSpendCents } from '@/store/selectors';
import { Button, EmptyState, Skeleton, useToast } from '@/ui';
import { currentMonth } from '../insights/monthMath';
import { computeSafeToSpend } from './safeToSpend';
import { SafeToSpendCard } from './SafeToSpendCard';
import { BudgetProgressCard } from './BudgetProgressCard';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';
import { TrendCard } from './TrendCard';
import { RecentTransactionsCard } from './RecentTransactionsCard';
import { UpcomingBillsCard } from './UpcomingBillsCard';

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-32" />
      <Skeleton className="h-20" />
      <Skeleton className="h-48" />
      <Skeleton className="h-24" />
    </div>
  );
}

function NewInstallEmptyState() {
  const navigate = useNavigate();
  const toast = useToast();
  const loadDemoData = useStore((s) => s.loadDemoData);
  const [loading, setLoading] = useState(false);

  const onLoadDemo = async () => {
    setLoading(true);
    try {
      await loadDemoData();
      toast.show('Demo data loaded — have a look around.', { variant: 'success' });
    } catch {
      toast.show("Couldn't load demo data — try again.", { variant: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-8">
      <EmptyState
        icon={Sparkles}
        headline="Welcome to Tally"
        body="Nothing logged yet — this is where your Safe-to-Spend number, budgets and trends will
          appear once there's something to show."
        action={
          <div className="flex w-full flex-col gap-3">
            <Button fullWidth onClick={() => navigate('/log')}>
              Log something
            </Button>
            <Button fullWidth variant="ghost" onClick={() => navigate('/import')}>
              Import a statement
            </Button>
            <Button fullWidth variant="ghost" onClick={onLoadDemo} disabled={loading}>
              {loading ? 'Loading demo data…' : 'Load demo data'}
            </Button>
          </div>
        }
      />
    </div>
  );
}

/**
 * Home / Dashboard — CONTRACTS.md §0 & §7. Safe-to-Spend hero, month spend vs budget,
 * category donut, sparkline trend, recent transactions, upcoming bills.
 */
export function DashboardScreen() {
  const hydrated = useStore((s) => s.hydrated);
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const budgets = useStore((s) => s.budgets);
  const recurring = useStore((s) => s.recurring);
  const settings = useStore((s) => s.settings);

  if (!hydrated) return <DashboardSkeleton />;
  if (txns.length === 0) return <NewInstallEmptyState />;

  const month = currentMonth();
  const monthTxns = txnsForMonth(txns, month);
  const spentCents = totalSpendCents(txns, month);
  const budgetCents = budgets.filter((b) => b.month === month).reduce((sum, b) => sum + b.limitCents, 0);
  const safeToSpend = computeSafeToSpend({ txns, recurring, settings, month });

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <SafeToSpendCard result={safeToSpend} />
      <BudgetProgressCard spentCents={spentCents} budgetCents={budgetCents} />
      <CategoryBreakdownCard txns={monthTxns} categories={categories} />
      <TrendCard txns={txns} month={month} />
      <RecentTransactionsCard txns={txns} categories={categories} />
      <UpcomingBillsCard recurring={recurring} categories={categories} />
    </div>
  );
}
