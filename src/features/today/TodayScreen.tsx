import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, EmptyState, Skeleton, useToast } from '@/ui';
import { useRoutineChecklist } from '@/features/routine';
import { computeSafeToSpend } from './safeToSpend';
import { buildComingUp } from './comingUp';
import { buildNeedsYou } from './needsYou';
import { SafeToSpendSection } from './SafeToSpendSection';
import { FoodTodaySection } from './FoodTodaySection';
import { ComingUpSection } from './ComingUpSection';
import { GoalRow } from './GoalRow';
import { NeedsYouSection } from './NeedsYouSection';

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6" aria-busy="true" aria-label="Loading today">
      <Skeleton className="h-32" />
      <Skeleton className="h-40" />
      <Skeleton className="h-48" />
      <Skeleton className="h-14" />
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
        body="Nothing logged yet — this is where your Safe-to-spend number, this week's food and what's
          coming up will appear once there's something to show."
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
 * Today — the summary screen (DESIGN-V3.md §4). Answers "am I OK?" in about
 * three seconds, in order: Safe to spend today, this week's food, what's
 * coming up in the next 14 days, the deposit goal, and — only when there's
 * genuinely something to say — what needs the user's attention. This
 * replaces the old ten-card Home (`src/features/dashboard`, now removed):
 * FoodWeekCard, DepositGoalCard, RoutineCard, SafeToSpendCard,
 * BudgetProgressCard, CategoryBreakdownCard, TrendCard,
 * RecentTransactionsCard, StatementsCard and UpcomingBillsCard all moved to
 * Spending/Plan or were absorbed into one of the five sections below — see
 * this feature's report for exactly where each one landed.
 */
export function TodayScreen() {
  const hydrated = useStore((s) => s.hydrated);
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const recurring = useStore((s) => s.recurring);
  const settings = useStore((s) => s.settings);
  const { state: routineChecklist, today } = useRoutineChecklist();

  const safeToSpend = useMemo(
    () => computeSafeToSpend({ txns, recurring, settings }),
    [txns, recurring, settings]
  );
  const comingUp = useMemo(
    () => buildComingUp({ txns, recurring, settings, today }),
    [txns, recurring, settings, today]
  );
  const needsYou = useMemo(
    () => buildNeedsYou({ txns, recurring, settings, routineState: routineChecklist.current, today }),
    [txns, recurring, settings, routineChecklist, today]
  );

  if (!hydrated) return <TodaySkeleton />;

  // "Nothing set up yet" is not the same as "nothing logged yet".
  //
  // Gating purely on transaction count meant that the moment right after
  // onboarding — income confirmed, budgets and subscriptions seeded, and the
  // user expecting to see their plan — Today still showed a generic welcome
  // screen. That is precisely the moment the app has to feel like theirs, and
  // every input Safe-to-Spend needs (income, committed recurring, savings
  // target) already exists at that point without a single transaction.
  //
  // So the empty state is now for a genuinely blank vault only.
  const hasSetup = settings.monthlyIncomeCents > 0 || recurring.length > 0;
  if (txns.length === 0 && !hasSetup) return <NewInstallEmptyState />;

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <SafeToSpendSection result={safeToSpend} />
      <FoodTodaySection txns={txns} categories={categories} />
      <ComingUpSection items={comingUp} />
      <GoalRow />
      <NeedsYouSection items={needsYou} />
    </div>
  );
}
