import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, EmptyState, Skeleton, useToast, TOAST_RESERVE_BOTTOM } from '@/ui';
import { useRoutineChecklist } from '@/features/routine';
import { computeMonthMoney } from '@/money';
import { buildBillsDueSoon } from './billsDueSoon';
import { buildToSortOut } from './toSortOut';
import { EquationSection } from './EquationSection';
import { WhereItWentSection } from './WhereItWentSection';
import { BillsDueSoonSection } from './BillsDueSoonSection';
import { DepositPlanRow } from './DepositPlanRow';
import { ToSortOutSection } from './ToSortOutSection';

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6" aria-busy="true" aria-label="Loading Home">
      <Skeleton className="h-64" />
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
        body="Nothing logged yet — this is where what's left to spend, where it went and what's coming up will
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
 * Home — the summary screen (DESIGN-V4.md §1/§2). There is exactly ONE money
 * calculation behind this whole screen — `computeMonthMoney` (`src/money`) —
 * computed once here and handed down; no section below recomputes a figure
 * that this one call already produced.
 *
 * In order (DESIGN-V4.md §1):
 *   1. The equation — income, bills, savings, what's left, laid out as the
 *      actual subtraction, not a hero number with its reasoning hidden.
 *   2. Where it went — the category breakdown of `spent`, food's line
 *      carrying its weekly target.
 *   3. Bills due soon — the next 14 days, merged into one list.
 *   4. Deposit plan — one row, not a card.
 *   5. To sort out — renders ONLY when there's genuinely something to say.
 */
export function TodayScreen() {
  const hydrated = useStore((s) => s.hydrated);
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const recurring = useStore((s) => s.recurring);
  const settings = useStore((s) => s.settings);
  const { state: routineChecklist, today } = useRoutineChecklist();

  const money = useMemo(
    () => computeMonthMoney({ txns, recurring, settings, categories }),
    [txns, recurring, settings, categories]
  );
  const billsDueSoon = useMemo(
    () => buildBillsDueSoon({ txns, recurring, settings, today }),
    [txns, recurring, settings, today]
  );
  const toSortOut = useMemo(
    () => buildToSortOut({ txns, recurring, settings, routineState: routineChecklist.current, today }),
    [txns, recurring, settings, routineChecklist, today]
  );

  if (!hydrated) return <HomeSkeleton />;

  // "Nothing set up yet" is not the same as "nothing logged yet".
  //
  // Gating purely on transaction count meant that the moment right after
  // onboarding — income confirmed, budgets and subscriptions seeded, and the
  // user expecting to see their plan — Home still showed a generic welcome
  // screen. That is precisely the moment the app has to feel like theirs, and
  // every input the equation needs (income, committed recurring, savings
  // target) already exists at that point without a single transaction.
  //
  // So the empty state is now for a genuinely blank vault only.
  const hasSetup = settings.monthlyIncomeCents > 0 || recurring.length > 0;
  if (txns.length === 0 && !hasSetup) return <NewInstallEmptyState />;

  return (
    // Reserve the toast's footprint. Home ends with the deposit plan row and the
    // "To sort out" section, and a toast fires on almost every action that lands
    // the user back here — so without this the two things the screen exists to
    // surface are exactly what gets covered.
    <div className="flex flex-col gap-6 px-4 py-6" style={{ paddingBottom: TOAST_RESERVE_BOTTOM }}>
      <EquationSection money={money} />
      <WhereItWentSection money={money} />
      <BillsDueSoonSection items={billsDueSoon} />
      <DepositPlanRow money={money} />
      <ToSortOutSection items={toSortOut} />
    </div>
  );
}
