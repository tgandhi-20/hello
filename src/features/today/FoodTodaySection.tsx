import React, { useMemo } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import type { Category, Txn } from '@/types';
import { Card, ProgressBar, formatMoney } from '@/ui';
import { StackedBar, clampRatio, safeDiv } from '@/charts';
import type { ChartDatum } from '@/charts';
import { computeFoodWeekStats, FOOD_WEEKLY_TARGET_CENTS, GROCERIES_CATEGORY_ID } from '@/features/food';

export interface FoodTodaySectionProps {
  txns: Txn[];
  categories: Category[];
}

/**
 * Today's second section (DESIGN-V3.md §4.2) — the user's single biggest
 * lever (PERSONAL.md §4: food is ~50% of spend, ~$260/wk actual vs $141/wk
 * target). `$X of $141`, a slim progress track, days left, and the
 * groceries-vs-eating-out split as one thin stacked bar.
 *
 * Reuses `computeFoodWeekStats` (src/features/food/foodStats.ts) rather than
 * re-deriving the week maths — this component only supplies the compact
 * layout DESIGN-V3.md §4 asks for (a progress track against the $141
 * target), which the existing `FoodWeekCard` doesn't carry. `FoodWeekCard`
 * itself was built for the old ten-card Home and is heavier than a summary
 * section needs (pace projection, last-week comparison, coffee count) — see
 * this feature's report.
 *
 * Tone (CONTRACTS.md §4, PERSONAL.md §4): calm and factual. Running over the
 * weekly target gets the amber `caution` tone at most, never `danger` — that
 * token is reserved for things that are actually broken elsewhere in the
 * app, not for buying lunch.
 */
export function FoodTodaySection({ txns, categories }: FoodTodaySectionProps) {
  const stats = useMemo(() => computeFoodWeekStats(txns, FOOD_WEEKLY_TARGET_CENTS), [txns]);
  const groceriesToken = categories.find((c) => c.id === GROCERIES_CATEGORY_ID)?.colorToken ?? 'cat-3';

  const splitData: ChartDatum[] = [
    { id: 'groceries', label: 'Groceries', value: stats.buckets.groceriesCents, colorToken: groceriesToken },
    { id: 'away', label: 'Eating out, lunch & coffee', value: stats.buckets.awayCents, colorToken: 'ink-3' },
  ];

  const over = stats.remainingCents < 0;
  const ratio = clampRatio(safeDiv(stats.spentCents, stats.targetCents, 0));

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="label flex items-center gap-1.5">
          <UtensilsCrossed size={14} aria-hidden="true" /> This week's food
        </span>
        <span className="text-xs text-ink-2">
          {stats.daysLeft} day{stats.daysLeft === 1 ? '' : 's'} left
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="money text-xl text-ink-1">{formatMoney(stats.spentCents)}</span>
        <span className="text-sm text-ink-2">of {formatMoney(stats.targetCents)}</span>
      </div>

      <ProgressBar
        value={ratio}
        tone={over ? 'warning' : 'accent'}
        label={`${formatMoney(stats.spentCents)} of ${formatMoney(stats.targetCents)} spent on food this week`}
      />

      <p className="text-xs text-ink-2">
        {over
          ? `${formatMoney(Math.abs(stats.remainingCents))} over this week's target — still tracking, no drama`
          : `${formatMoney(stats.remainingCents)} left this week`}
      </p>

      <StackedBar segments={splitData} formatValue={(v) => formatMoney(v)} height={10} />
    </Card>
  );
}
