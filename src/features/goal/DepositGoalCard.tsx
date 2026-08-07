import React, { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { Card, ProgressBar, Chip, formatMoney, todayStr } from '@/ui';
import { clampRatio, safeDiv } from '@/charts';
import { buildGoalProjection, balanceAtDate, monthOf, monthsBetween } from './projection';
import { findBonusRateGuardWarnings } from './bonusRateGuard';
import { useCurrentSavingsBalance } from './currentBalance';
import { GoalProjectionChart } from './GoalProjectionChart';
import { BalanceEditor } from './BalanceEditor';
import { daysUntil } from './dateMath';

/**
 * Mounted on the dashboard by Agent P2. Shows progress toward the $72,339 deposit
 * target, whether the user is on/off the plan's own trajectory for today, and a
 * compact projection chart with the planned one-off dips left visible.
 */
export function DepositGoalCard() {
  const projection = useMemo(() => buildGoalProjection(), []);
  const today = todayStr();

  const plannedTodayCents = useMemo(
    () => balanceAtDate(projection.input, projection.points, today),
    [projection, today]
  );

  const [balanceState, setBalance, resetBalance] = useCurrentSavingsBalance(plannedTodayCents);

  const progressRatio = clampRatio(safeDiv(balanceState.balanceCents, projection.targetCents, 0));
  const daysLeft = Math.max(0, daysUntil(projection.targetDate));
  const monthsLeft = Math.max(0, monthsBetween(monthOf(today), monthOf(projection.targetDate)));

  // "On track" compares the entered/estimated pool against the plan's own trajectory
  // for today — not against the final target. Being $2,000 behind with 14 months to
  // go is a different fact than being $2,000 behind with 2 months to go; comparing to
  // today's planned figure is what actually tells the user that.
  const behindCents = plannedTodayCents - balanceState.balanceCents;
  const onTrack = behindCents <= 0;

  const warnings = useMemo(() => findBonusRateGuardWarnings(projection.points), [projection]);
  const nextWarning = warnings.find((w) => w.month >= monthOf(today));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-tint-12)]">
            <Target size={18} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
          </div>
          <span className="text-sm font-medium text-text-2">Deposit goal</span>
        </div>
        <Chip tone={onTrack ? 'positive' : 'neutral'} className="pointer-events-none min-h-0 px-3 py-1 text-xs">
          <span className="inline-flex items-center gap-1">
            {onTrack ? (
              <TrendingUp size={13} strokeWidth={2} aria-hidden="true" />
            ) : (
              <TrendingDown size={13} strokeWidth={2} aria-hidden="true" />
            )}
            {onTrack ? 'On track' : `${formatMoney(behindCents)} behind plan`}
          </span>
        </Chip>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="tabular-nums text-2xl font-semibold text-text-1">
            {formatMoney(balanceState.balanceCents)}
          </span>
          <span className="text-sm text-text-2">of {formatMoney(projection.targetCents)}</span>
        </div>
        <span className="text-xs text-text-3">
          {balanceState.isUserEntered ? 'Balance you entered' : "Estimated from the plan — not observed"}
        </span>
      </div>

      <ProgressBar
        value={progressRatio}
        tone={onTrack ? 'positive' : 'warning'}
        label={`${Math.round(progressRatio * 100)}% of deposit target`}
      />

      <p className="text-sm text-text-2">
        {daysLeft} day{daysLeft === 1 ? '' : 's'} ({monthsLeft} month{monthsLeft === 1 ? '' : 's'}) until
        settlement, 30 October 2027.
      </p>

      <GoalProjectionChart points={projection.points} targetCents={projection.targetCents} height={110} />

      {nextWarning ? (
        <div className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-3 text-xs text-text-2">
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {nextWarning.month} withdrawals ({formatMoney(nextWarning.withdrawalsCents)}) outpace deposits (
            {formatMoney(nextWarning.depositsCents)}) — worth confirming the bonus-rate condition with
            Bankwest before then. See the goal screen for details.
          </span>
        </div>
      ) : null}

      <BalanceEditor
        balanceCents={balanceState.balanceCents}
        isUserEntered={balanceState.isUserEntered}
        onSave={setBalance}
        onReset={resetBalance}
      />
    </Card>
  );
}
