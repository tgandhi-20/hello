import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { Category, RecurringSeries } from '@/types';
import { Card, CategoryIcon, EmptyState, formatMoney, formatRelativeDay, todayStr, addDays } from '@/ui';

export interface UpcomingBillsCardProps {
  recurring: RecurringSeries[];
  categories: Category[];
  /** Look-ahead window in days. */
  withinDays?: number;
}

/**
 * Preview of what's due soon. Reads `recurring` from the store — Agent 4 populates detection;
 * this degrades to a friendly empty state when nothing's been detected yet.
 */
export function UpcomingBillsCard({ recurring, categories, withinDays = 14 }: UpcomingBillsCardProps) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const today = todayStr();
  const horizon = addDays(today, withinDays);

  const upcoming = recurring
    .filter((r) => !r.muted && r.nextDue >= today && r.nextDue <= horizon)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-md font-semibold text-ink-1">Upcoming bills</h2>
      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          headline="Nothing due in the next 2 weeks"
          body="Recurring bills Tally detects from your transactions will show up here."
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {upcoming.map((r) => {
            const cat = catMap.get(r.categoryId);
            return (
              <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <CategoryIcon icon={cat?.icon ?? 'Repeat'} colorToken={cat?.colorToken ?? 'ink-3'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-1">{r.merchant}</p>
                  <p className="text-xs text-ink-3">Due {formatRelativeDay(r.nextDue)}</p>
                </div>
                <span className="money shrink-0 text-sm text-ink-1">{formatMoney(r.amountCents)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
