import React, { useMemo } from 'react';
import { UtensilsCrossed, Coffee as CoffeeIcon } from 'lucide-react';
import type { Category, DateStr, Txn } from '@/types';
import { Card, formatMoney } from '@/ui';
import { StackedBar, formatPercent } from '@/charts';
import type { ChartDatum } from '@/charts';
import { computeFoodWeekStats } from './foodStats';
import { FOOD_WEEKLY_TARGET_CENTS, GROCERIES_CATEGORY_ID } from './config';

export interface FoodWeekCardProps {
  txns: Txn[];
  categories: Category[];
}

const MONTH_SHORT = new Intl.DateTimeFormat('en-AU', { month: 'short' });

function dayNum(d: DateStr): number {
  return Number(d.slice(8, 10));
}
function monthShort(d: DateStr): string {
  const [y, m] = d.split('-').map(Number);
  return MONTH_SHORT.format(new Date(y, m - 1, 1));
}
/** "4–10 Aug", or "28 Jul – 3 Aug" across a month boundary. */
function weekRangeLabel(start: DateStr, end: DateStr): string {
  const startMonth = monthShort(start);
  const endMonth = monthShort(end);
  if (startMonth === endMonth) return `${dayNum(start)}–${dayNum(end)} ${endMonth}`;
  return `${dayNum(start)} ${startMonth} – ${dayNum(end)} ${endMonth}`;
}

/**
 * The Home screen's hero card (PERSONAL.md §0/§4) — the user's own analysis found
 * food is ~50% of all spending and the single biggest behavioural lever in the
 * whole deposit plan, tracked weekly (not monthly) because a monthly view hides
 * the damage until it's done.
 *
 * Tone (CONTRACTS.md §4, PERSONAL.md §4): calm and factual, always. Numbers are
 * reported, never moralised — "over budget" is information, not a verdict. No red
 * "danger" styling appears anywhere in this card for merely running over target;
 * that token is reserved for things that are actually broken elsewhere in the app.
 */
export function FoodWeekCard({ txns, categories }: FoodWeekCardProps) {
  const stats = useMemo(() => computeFoodWeekStats(txns, FOOD_WEEKLY_TARGET_CENTS), [txns]);

  const groceriesToken = categories.find((c) => c.id === GROCERIES_CATEGORY_ID)?.colorToken ?? 'cat-3';

  // Groceries keeps its real category colour — it's the behavioural lever this card exists to
  // highlight (PERSONAL.md §4: cooking more is the lever, the ratio is the proof). "Away" spans
  // three categories with three different hues, so rather than borrow `--accent` (reserved for
  // interactive affordance, DESIGN.md §2) it stays quiet ink — a neutral backdrop the coloured
  // groceries slice reads against, not a second competing colour.
  const splitData: ChartDatum[] = [
    { id: 'groceries', label: 'Groceries', value: stats.buckets.groceriesCents, colorToken: groceriesToken },
    { id: 'away', label: 'Eating out, lunch & coffee', value: stats.buckets.awayCents, colorToken: 'ink-3' },
  ];

  const over = stats.remainingCents < 0;
  const deltaAbs = Math.abs(stats.vsLastWeekDeltaCents);
  const hadLastWeek = stats.lastWeek.spentCents > 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint">
          <UtensilsCrossed size={20} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="label">Food this week</p>
          <h2 className="text-md font-semibold text-ink-1">
            {weekRangeLabel(stats.weekStart, stats.weekEnd)} · {stats.daysLeft} day{stats.daysLeft === 1 ? '' : 's'}{' '}
            left
          </h2>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/*
            The hero figure stays neutral ink even when over target.

            Colouring it red contradicted the line directly beneath it ("still
            tracking, no drama") and, more importantly, CONTRACTS.md §4: this app
            reports facts, it does not scold. Being $14 over a weekly food target
            is information, not a failure — and a number that turns red every time
            the user buys lunch trains them to stop opening the app.

            The supporting line carries the state instead, which is where a reader
            actually looks for interpretation.
          */}
          <span className="money-hero text-2xl text-ink-1">
            {formatMoney(stats.spentCents)}
          </span>
          <span className="text-sm text-ink-2">this week · {formatMoney(stats.targetCents)} target</span>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {over
            ? `${formatMoney(Math.abs(stats.remainingCents))} over this week's target — still tracking, no drama`
            : `${formatMoney(stats.remainingCents)} left this week`}
        </p>
      </div>

      <div className="flex flex-col gap-1 rounded-card bg-surface-sunk px-3 py-2.5">
        {stats.daysElapsed < 7 ? (
          <p className="text-sm text-ink-2">
            On pace for about{' '}
            <span className="money text-ink-1">{formatMoney(stats.projectedWeekTotalCents)}</span> by Sunday
          </p>
        ) : (
          <p className="text-sm text-ink-2">Week complete.</p>
        )}
        <p className="text-sm text-ink-2">
          {stats.vsLastWeekDeltaCents === 0 ? (
            hadLastWeek ? (
              'Same as last week'
            ) : (
              'No comparison yet — nothing logged last week'
            )
          ) : (
            <>
              <span className="money text-ink-1">{formatMoney(deltaAbs)}</span>{' '}
              {stats.vsLastWeekDeltaCents > 0 ? 'more' : 'less'} than last week (
              {formatMoney(stats.lastWeek.spentCents)})
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-ink-1">Groceries vs eating out</h3>
          <span className="tabular-nums text-sm text-ink-2">
            {formatPercent(stats.groceriesRatio)} · {formatPercent(stats.awayRatio)}
          </span>
        </div>
        <StackedBar segments={splitData} formatValue={(v) => formatMoney(v)} />
      </div>

      <div className="flex items-center gap-2 border-t border-hairline pt-3 text-sm text-ink-2">
        <CoffeeIcon size={16} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
        {stats.coffee.count > 0 ? (
          <span>
            <span className="money text-ink-1">{stats.coffee.count}</span> coffee
            {stats.coffee.count === 1 ? '' : 's'} this week · avg{' '}
            <span className="money text-ink-1">{formatMoney(stats.coffee.avgCents)}</span>
          </span>
        ) : (
          <span>No coffee logged this week</span>
        )}
      </div>
    </Card>
  );
}
