import React from 'react';
import { Skeleton } from '@/ui';
import { CardCycleSection } from './CardCycleSection';
import { SeriesList } from './SeriesList';
import { UpcomingCalendarSection } from './UpcomingCalendarSection';
import { CARD_ACCOUNT_IDS } from './types';
import { useStatementsOverview } from './useStatementsOverview';

/**
 * The full Statements page — one place for "what will this statement be?",
 * per-card cycle dates (with override), the 60-day cashflow calendar, and
 * the recurring-series confirm/edit list. Not wired into `src/app/**`'s
 * router by this feature (out of this feature's ownership) — exported here
 * so whoever owns routing/navigation can add a route once, the same way
 * `StatementsCard` is exported for the dashboard to mount.
 */
export function StatementsScreen(): React.JSX.Element {
  const { hydrated, balances, cashflow } = useStatementsOverview();

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6" aria-busy="true" aria-label="Loading statements">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {CARD_ACCOUNT_IDS.map((accountId) => {
        const balance = balances[accountId];
        return balance ? <CardCycleSection key={accountId} accountId={accountId} balance={balance} /> : null;
      })}
      <UpcomingCalendarSection cashflow={cashflow} />
      <SeriesList />
    </div>
  );
}
