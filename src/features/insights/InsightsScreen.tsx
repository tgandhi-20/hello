import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { dayCells, txnsForMonth } from '@/store/selectors';
import { Card, EmptyState, formatMoney } from '@/ui';
import { ColumnChart, StackedBar } from '@/charts';
import type { ChartDatum } from '@/charts';
import { CalendarHeatmap } from './CalendarHeatmap';
import { currentMonth, monthShortLabel, prevMonth } from './monthMath';
import { averageDailySpendCents, biggestMovers, needsWantsSplit, spendByDayOfWeek, trailingMonthTotals } from './selectors';

/**
 * Trends/Insights screen — CONTRACTS.md §5: month-over-month, needs/wants/savings vs the
 * 50/30/20 reference, biggest movers, average daily spend, spend by day of week, and the
 * calendar heatmap (CONTRACTS.md §7).
 */
export function InsightsScreen() {
  const hydrated = useStore((s) => s.hydrated);
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const [month, setMonth] = useState(currentMonth());

  const cells = useMemo(() => dayCells(txns, month), [txns, month]);
  const last = prevMonth(month);

  const monthTotals = useMemo(() => trailingMonthTotals(txns, month, 6), [txns, month]);
  const split = useMemo(() => needsWantsSplit(txns, categories, month), [txns, categories, month]);
  const movers = useMemo(() => biggestMovers(txns, categories, month, last, 5), [txns, categories, month, last]);
  const avgDaily = useMemo(() => averageDailySpendCents(txns, month), [txns, month]);
  const weekday = useMemo(() => spendByDayOfWeek(txns, month), [txns, month]);

  if (!hydrated) return null;

  if (txns.length === 0) {
    return (
      <div className="px-4 py-8">
        <EmptyState
          icon={BarChart3}
          headline="Trends will appear once you've logged something"
          body="Spend patterns, category splits and your spending calendar all build up from your transactions."
        />
      </div>
    );
  }

  // `--accent` is reserved for interactive affordance (DESIGN.md §2), not for picking out "the
  // current month" in a static bar chart — weight/brightness carries that emphasis instead, the
  // same way typography carries hierarchy elsewhere (DESIGN.md §1.3): the current month is bright
  // ink-1, every other month recedes to ink-3.
  const columnData: ChartDatum[] = monthTotals.map((mt) => ({
    id: mt.month,
    label: monthShortLabel(mt.month),
    value: mt.totalCents,
    colorToken: mt.month === month ? 'ink-1' : 'ink-3',
  }));

  // One series, no state to distinguish between bars — plain ink, not the interactive accent.
  const weekdayData: ChartDatum[] = weekday.map((w, i) => ({
    id: String(i),
    label: w.label,
    value: w.totalCents,
    colorToken: 'ink-2',
  }));

  // Needs/wants/savings is a categorical split, not a direction-or-state signal, so it draws from
  // the category ramp (DESIGN.md §2) rather than mixing in the reserved accent/semantic tokens.
  const splitSegments: ChartDatum[] = [
    { id: 'need', label: 'Needs', value: split.needCents, colorToken: 'cat-1' },
    { id: 'want', label: 'Wants', value: split.wantCents, colorToken: 'cat-5' },
    { id: 'save', label: 'Savings', value: split.saveCents, colorToken: 'cat-2' },
  ];

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Card>
        <CalendarHeatmap month={month} onMonthChange={setMonth} cells={cells} txns={txns} categories={categories} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-md font-semibold text-ink-1">Month by month</h2>
        <ColumnChart data={columnData} formatValue={(v) => formatMoney(v)} />
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink-1">Needs, wants &amp; savings</h2>
          <p className="text-xs text-ink-2">Reference line at 50% / 80% — the 50/30/20 rule of thumb.</p>
        </div>
        <StackedBar
          segments={splitSegments}
          referenceMarks={[
            { at: 0.5, label: '50%' },
            { at: 0.8, label: '80%' },
          ]}
          formatValue={(v) => formatMoney(v)}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-md font-semibold text-ink-1">Biggest movers vs last month</h2>
        {movers.length === 0 ? (
          <p className="text-sm text-ink-2">Not enough history yet to compare.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {movers.map((m) => (
              <li key={m.categoryId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{m.label}</span>
                <span className="flex shrink-0 items-center gap-1 text-sm">
                  {/* No `--positive`/`--negative` token in v3 (DESIGN-V3.md §1) — a category
                      spending more than last month is a fact worth a light nudge (`--caution`),
                      spending less needs no colour at all; it reads as the absence of warning. */}
                  {m.deltaCents > 0 ? (
                    <ArrowUp size={14} className="text-caution" aria-hidden="true" />
                  ) : m.deltaCents < 0 ? (
                    <ArrowDown size={14} className="text-ink-2" aria-hidden="true" />
                  ) : null}
                  <span className={['money', m.deltaCents > 0 ? 'text-ink-1' : 'text-ink-2'].join(' ')}>
                    {formatMoney(Math.abs(m.deltaCents))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-md font-semibold text-ink-1">Average daily spend</h2>
          <p className="text-xs text-ink-2">Based on days elapsed this month</p>
        </div>
        <span className="money-hero text-xl text-ink-1">{formatMoney(avgDaily)}</span>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-md font-semibold text-ink-1">Spend by day of week</h2>
        <ColumnChart data={weekdayData} formatValue={(v) => formatMoney(v)} />
      </Card>
    </div>
  );
}
