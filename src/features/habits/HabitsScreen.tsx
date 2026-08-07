import React, { useMemo } from 'react';
import { Flame, Coffee, UtensilsCrossed, Soup } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, EmptyState, formatMoney, todayStr } from '@/ui';
import { computeHabitStats, recentSpendSeries } from './stats';
import { Sparkline } from './Sparkline';

/** Calm, factual delta phrasing — never "you're overspending", just the numbers. */
function coffeeDeltaLabel(thisMonth: number, lastMonth: number): string {
  if (lastMonth === 0) return `${thisMonth} logged this month`;
  const diff = thisMonth - lastMonth;
  if (diff === 0) return `Same as last month (${lastMonth})`;
  const word = diff > 0 ? 'more' : 'fewer';
  return `${Math.abs(diff)} ${word} than last month (${lastMonth})`;
}

export function HabitsScreen() {
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);

  const today = todayStr();
  const stats = useMemo(() => computeHabitStats(txns, categories, { today }), [txns, categories, today]);
  const spendSeries = useMemo(() => recentSpendSeries(txns, 30, today), [txns, today]);

  if (txns.length === 0) {
    return (
      <EmptyState
        icon={Flame}
        headline="Habits will build up here"
        body="Once you've logged a few days of spending, streaks and patterns show up on this tab."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <Card className="flex flex-col gap-3">
        <span className="label flex items-center gap-1.5">
          <Flame size={14} aria-hidden="true" /> No-spend streak
        </span>
        <div className="flex items-end justify-between">
          <div>
            <p className="money-hero text-2xl text-ink-1">{stats.noSpendStreak}</p>
            <p className="text-xs text-ink-3">
              {stats.noSpendStreak === 1 ? 'day' : 'days'} in a row · best {stats.bestNoSpendStreak}
            </p>
          </div>
          <Sparkline values={spendSeries.map((d) => d.cents)} colorToken="accent" className="max-w-[45%]" />
        </div>
        <p className="text-xs text-ink-3">A broken streak is just a fact — it resets, it doesn't judge.</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="label flex items-center gap-1.5">
          <Coffee size={14} aria-hidden="true" /> Coffee
        </span>
        <p className="money-hero text-2xl text-ink-1">{formatMoney(stats.coffeeSpendCents)}</p>
        <p className="text-xs text-ink-3">spent this month · {stats.coffeesThisMonth} coffees</p>
        <p className="text-xs text-ink-2">{coffeeDeltaLabel(stats.coffeesThisMonth, stats.coffeesLastMonth)}</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="label flex items-center gap-1.5">
          <Soup size={14} aria-hidden="true" /> Lunch habit
        </span>
        <p className="money-hero text-2xl text-ink-1">{formatMoney(stats.lunchSpendPerWeekCents)}</p>
        <p className="text-xs text-ink-3">average per week, last 8 weeks</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="label flex items-center gap-1.5">
          <UtensilsCrossed size={14} aria-hidden="true" /> Dining out
        </span>
        <p className="money-hero text-2xl text-ink-1">{formatMoney(stats.diningOutThisMonthCents)}</p>
        <p className="text-xs text-ink-3">spent this month</p>
      </Card>
    </div>
  );
}
