import React, { useMemo } from 'react';
import { Target, AlertTriangle, ArrowDownCircle, Info } from 'lucide-react';
import { Card, ProgressBar, Chip, formatMoney } from '@/ui';
import { clampRatio, safeDiv } from '@/charts';
import { GOAL } from '@/personal/plan';
import { buildGoalProjection, balanceAtDate } from './projection';
import { findBonusRateGuardWarnings } from './bonusRateGuard';
import { buildWhatIfPresets, WHAT_IF_PRESET_MONTHLY_SAVINGS_CENTS } from './whatIf';
import { useCurrentSavingsBalance } from './currentBalance';
import { GoalProjectionChart } from './GoalProjectionChart';
import { BalanceEditor } from './BalanceEditor';
import { daysUntil, monthLabel, monthShortLabel } from './dateMath';
import { todayStr } from '@/ui/format';

/**
 * Full deposit-goal screen — route content only (CONTRACTS.md: this feature does not
 * own the router; whoever mounts this decides the path). Month-by-month table with
 * the one-offs and target marked, the compact card's chart at full size, the October
 * 2026 bonus-rate guard explained in full, and a savings-rate what-if.
 */
export function GoalScreen() {
  const projection = useMemo(() => buildGoalProjection(), []);
  const today = todayStr();

  const plannedTodayCents = useMemo(
    () => balanceAtDate(projection.input, projection.points, today),
    [projection, today]
  );
  const [balanceState, setBalance, resetBalance] = useCurrentSavingsBalance(plannedTodayCents);

  const progressRatio = clampRatio(safeDiv(balanceState.balanceCents, projection.targetCents, 0));
  const daysLeft = Math.max(0, daysUntil(projection.targetDate));

  const warnings = useMemo(() => findBonusRateGuardWarnings(projection.points), [projection]);
  const warningMonths = new Set(warnings.map((w) => w.month));

  const whatIfPresets = useMemo(() => buildWhatIfPresets(), []);

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Target size={20} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-text-1">Deposit goal</h1>
        </div>
        <p className="text-sm text-text-2">{GOAL.purpose}</p>
      </div>

      {/* --- Summary --- */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="tabular-nums text-2xl font-semibold text-text-1">
            {formatMoney(balanceState.balanceCents)}
          </span>
          <span className="text-sm text-text-2">of {formatMoney(projection.targetCents)}</span>
        </div>
        <span className="text-xs text-text-3">
          {balanceState.isUserEntered ? 'Balance you entered' : 'Estimated from the plan — not observed'}
        </span>
        <ProgressBar
          value={progressRatio}
          tone={balanceState.balanceCents >= plannedTodayCents ? 'positive' : 'warning'}
          label={`${Math.round(progressRatio * 100)}% of deposit target`}
        />
        <p className="text-sm text-text-2">
          {daysLeft} day{daysLeft === 1 ? '' : 's'} until settlement, {formatDateLong(projection.targetDate)}.
        </p>
        <BalanceEditor
          balanceCents={balanceState.balanceCents}
          isUserEntered={balanceState.isUserEntered}
          onSave={setBalance}
          onReset={resetBalance}
        />
      </Card>

      {/* --- Chart --- */}
      <Card className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-1">Projected path</span>
        <GoalProjectionChart points={projection.points} targetCents={projection.targetCents} height={180} showLegend />
        <p className="text-xs text-text-3">
          The two dips are the planned one-offs, not modelling errors — see below.
        </p>
      </Card>

      {/* --- One-offs --- */}
      <Card className="flex flex-col gap-3">
        <span className="text-sm font-medium text-text-1">Planned one-offs</span>
        {projection.points
          .filter((p) => p.oneOffCents < 0)
          .map((p) => (
            <div key={p.month} className="flex items-center gap-3">
              <ArrowDownCircle size={18} strokeWidth={1.75} className="shrink-0 text-danger" aria-hidden="true" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm text-text-1">{p.oneOffLabels.join(', ')}</span>
                <span className="text-xs text-text-3">{monthLabel(p.month)}</span>
              </div>
              <span className="tabular-nums text-sm font-medium text-danger">{formatMoney(p.oneOffCents)}</span>
            </div>
          ))}
      </Card>

      {/* --- October 2026 bonus-rate guard --- */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
          <span className="text-sm font-medium text-text-1">Bonus-rate check</span>
        </div>
        {warnings.length === 0 ? (
          <p className="text-sm text-text-2">
            No month in this projection currently has withdrawals exceeding deposits.
          </p>
        ) : (
          warnings.map((w) => (
            <div key={w.month} className="flex flex-col gap-1 rounded-2xl border border-warning/30 p-3">
              <span className="text-sm text-text-1">
                {monthLabel(w.month)}: {formatMoney(w.withdrawalsCents)} out vs {formatMoney(w.depositsCents)} in
              </span>
              <p className="text-xs text-text-2">{w.notice}</p>
              <p className="text-xs text-text-2">
                <span className="font-medium text-text-1">If it applies:</span> {w.suggestedFix}
              </p>
              <p className="text-xs text-text-3">
                Illustrative only, unconfirmed — roughly {formatMoney(w.approxCostIfDroppedCentsUnverified)} for the
                month if the rate did drop to the base rate.
              </p>
            </div>
          ))
        )}
        <div className="flex items-start gap-2 text-xs text-text-3">
          <Info size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            This entire section describes how bonus-rate savers commonly work, not a confirmed term of this
            account — it still needs checking with Bankwest.
          </span>
        </div>
      </Card>

      {/* --- Month-by-month table --- */}
      <Card padded={false} className="flex flex-col gap-2 py-4">
        <span className="px-4 text-sm font-medium text-text-1">Month by month</span>
        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-3">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 font-medium">Rate</th>
                <th className="py-2 pr-3 text-right font-medium">Contribution</th>
                <th className="py-2 pr-3 text-right font-medium">One-off</th>
                <th className="py-2 pr-3 text-right font-medium">Interest (net)</th>
                <th className="py-2 pr-3 text-right font-medium">Closing balance</th>
              </tr>
            </thead>
            <tbody>
              {projection.points.map((p) => (
                <tr key={p.month} className="border-b border-border/60 tabular-nums">
                  <td className="py-2 pr-3 text-text-1">
                    {monthShortLabel(p.month)}
                    {warningMonths.has(p.month) ? (
                      <AlertTriangle
                        size={12}
                        strokeWidth={2}
                        className="ml-1 inline-block text-warning"
                        aria-label="Withdrawals exceed deposits this month"
                      />
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-text-2">{p.annualRatePct}%</td>
                  <td className="py-2 pr-3 text-right text-text-2">{formatMoney(p.contributionCents)}</td>
                  <td className={['py-2 pr-3 text-right', p.oneOffCents < 0 ? 'text-danger' : 'text-text-3'].join(' ')}>
                    {p.oneOffCents < 0 ? formatMoney(p.oneOffCents) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right text-positive">{formatMoney(p.netInterestCents)}</td>
                  <td className="py-2 pr-3 text-right font-medium text-text-1">
                    {formatMoney(p.closingBalanceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 text-xs text-text-3">
          Interest shown is after 32% tax on interest income — see the projection engine's notes for why.
          Target: {formatMoney(projection.targetCents)} by {monthLabel(GOAL.targetDate.slice(0, 7))}.
        </p>
      </Card>

      {/* --- What-if: savings rate --- */}
      <Card className="flex flex-col gap-3">
        <span className="text-sm font-medium text-text-1">What if you saved a different amount?</span>
        <p className="text-xs text-text-2">
          Less savings buys more food budget, not necessarily a smaller apartment deposit — see the gap column.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-3">
                <th className="py-2 pr-3 font-medium">Saving / month</th>
                <th className="py-2 pr-3 text-right font-medium">Food / week</th>
                <th className="py-2 pr-3 text-right font-medium">Pool at target date</th>
                <th className="py-2 pr-3 text-right font-medium">vs $72,339</th>
              </tr>
            </thead>
            <tbody>
              {whatIfPresets.map((s, i) => {
                const isPlan = WHAT_IF_PRESET_MONTHLY_SAVINGS_CENTS[i] === 350_000;
                return (
                  <tr
                    key={s.monthlySavingsCents}
                    className={['border-b border-border/60 tabular-nums', isPlan ? 'bg-[var(--accent-tint-12)]' : ''].join(
                      ' '
                    )}
                  >
                    <td className="py-2 pr-3 text-text-1">
                      {formatMoney(s.monthlySavingsCents)}
                      {isPlan ? <span className="ml-1 text-xs text-accent">(plan)</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right text-text-2">
                      {s.feasible ? formatMoney(s.weeklyFoodBudgetCents) : 'not feasible'}
                    </td>
                    <td className="py-2 pr-3 text-right text-text-1">{formatMoney(s.finalPoolCents)}</td>
                    <td
                      className={[
                        'py-2 pr-3 text-right',
                        s.finalPoolGapVsTargetCents >= 0 ? 'text-positive' : 'text-danger',
                      ].join(' ')}
                    >
                      {s.finalPoolGapVsTargetCents >= 0 ? '+' : ''}
                      {formatMoney(s.finalPoolGapVsTargetCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {whatIfPresets.map((s) => (
            <Chip key={s.monthlySavingsCents} tone="neutral" className="pointer-events-none min-h-0 px-3 py-1.5 text-xs">
              {formatMoney(s.monthlySavingsCents)} → {s.feasible ? formatMoney(s.weeklyFoodBudgetCents) : 'infeasible'}
              /wk food
            </Chip>
          ))}
        </div>
      </Card>
    </div>
  );
}

function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, d)
  );
}
