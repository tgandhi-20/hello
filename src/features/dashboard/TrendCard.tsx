import React, { useMemo } from 'react';
import { TrendingUp, ArrowDown, ArrowUp } from 'lucide-react';
import type { MonthStr, Txn } from '@/types';
import { Card, formatMoney } from '@/ui';
import { Sparkline, safeDiv } from '@/charts';
import { daysInMonth } from '@/ui/format';
import { currentMonth, daysElapsedInMonth, isCurrentMonth, prevMonth } from '../insights/monthMath';

export interface TrendCardProps {
  txns: Txn[];
  month?: MonthStr;
}

function cumulativeDailySpend(txns: Txn[], month: MonthStr, upToDay: number): number[] {
  const totals = new Array(upToDay).fill(0);
  for (const t of txns) {
    if (!t.date.startsWith(month) || t.excluded || t.amountCents <= 0) continue;
    const day = Number(t.date.slice(8, 10));
    if (day >= 1 && day <= upToDay) totals[day - 1] += t.amountCents;
  }
  let running = 0;
  return totals.map((v) => (running += v));
}

/** Cumulative month-to-date spend vs the same point last month, as a sparkline. */
export function TrendCard({ txns, month = currentMonth() }: TrendCardProps) {
  const last = prevMonth(month);

  const { thisMonth, lastMonth, thisTotal, lastTotal } = useMemo(() => {
    const elapsed = isCurrentMonth(month) ? daysElapsedInMonth(month) : daysInMonth(month);
    const lastElapsed = Math.min(elapsed, daysInMonth(last));
    const tm = cumulativeDailySpend(txns, month, Math.max(elapsed, 1));
    const lm = cumulativeDailySpend(txns, last, Math.max(lastElapsed, 1));
    return {
      thisMonth: tm,
      lastMonth: lm,
      thisTotal: tm.length ? tm[tm.length - 1] : 0,
      lastTotal: lm.length ? lm[lm.length - 1] : 0,
    };
  }, [txns, month, last]);

  const deltaCents = thisTotal - lastTotal;
  const deltaRatio = safeDiv(deltaCents, Math.max(lastTotal, 1), 0);
  const hasComparison = lastTotal > 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
        <h2 className="text-md font-semibold text-ink-1">Spend trend</h2>
      </div>
      <Sparkline
        data={thisMonth}
        compareData={lastMonth}
        ariaLabel={`Month-to-date spend: ${formatMoney(thisTotal)} so far, vs ${formatMoney(lastTotal)} at the same point last month.`}
      />
      <p className="flex items-center gap-1.5 text-sm text-ink-2">
        <span className="money text-ink-1">{formatMoney(thisTotal)}</span>
        <span>month to date</span>
        {hasComparison ? (
          <span className="money ml-auto inline-flex items-center gap-1 text-ink-2">
            {deltaCents > 0 ? (
              <ArrowUp size={14} className="text-negative" aria-hidden="true" />
            ) : deltaCents < 0 ? (
              <ArrowDown size={14} className="text-positive" aria-hidden="true" />
            ) : null}
            {Math.abs(Math.round(deltaRatio * 100))}% vs last month
          </span>
        ) : null}
      </p>
    </Card>
  );
}
