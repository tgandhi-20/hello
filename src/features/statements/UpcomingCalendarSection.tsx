import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarClock, CreditCard, Repeat, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, EmptyState, formatDate, formatMoney } from '@/ui';
import type { CashflowEventWithBalance, CashflowSummary } from './upcoming';

const KIND_ICON: Record<CashflowEventWithBalance['kind'], LucideIcon> = {
  recurring: Repeat,
  'card-payment': CreditCard,
  income: ArrowDownCircle,
  'savings-transfer': ArrowUpCircle,
};

function eventCaption(event: CashflowEventWithBalance): string {
  const parts: string[] = [formatDate(event.date, 'medium')];
  if (event.certainty === 'predicted') parts.push('predicted');
  if (event.amountBasis === 'typical-monthly-estimate') parts.push('estimated');
  if (event.amountBasis === 'actual-closed') parts.push('actual');
  if (event.kind === 'recurring' && !event.affectsBalance) parts.push('billed via card');
  return parts.join(' · ');
}

export interface UpcomingCalendarSectionProps {
  cashflow: CashflowSummary;
}

/**
 * Forward 60-day cashflow calendar (deliverable 3): every predicted
 * recurring charge, each card's payment due date, salary, and the savings
 * transfer, with a running projected balance so a squeeze is visible before
 * it happens.
 */
export function UpcomingCalendarSection({ cashflow }: UpcomingCalendarSectionProps) {
  if (cashflow.events.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarClock}
          headline="Nothing scheduled in the next 60 days"
          body="Recurring bills, card due dates, salary and your savings transfer will show up here once Tally has learned them."
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-1">
        <CalendarClock size={16} aria-hidden="true" /> Next 60 days
      </h2>

      {cashflow.squeezeWarning ? (
        <div className="flex items-start gap-2 rounded-control bg-surface-2 p-3">
          <TrendingDown size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-negative" />
          <p className="text-sm text-ink-1">
            Your projected balance goes below zero around{' '}
            {cashflow.lowestPointDate ? formatDate(cashflow.lowestPointDate, 'long') : 'this window'} (
            {formatMoney(cashflow.lowestPointCents)}). This is a net change from today, not a real account balance —
            Tally doesn't know your starting balance.
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-hairline">
        {cashflow.events.map((event) => {
          const Icon = KIND_ICON[event.kind];
          const cashIn = event.amountCents < 0;
          return (
            <li key={event.sourceId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                <Icon size={14} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-1">{event.label}</p>
                <p className="text-xs text-ink-3">{eventCaption(event)}</p>
              </div>
              <span className={['money shrink-0 text-sm', cashIn ? 'text-positive' : 'text-ink-1'].join(' ')}>
                {event.amountCents === 0 ? '—' : formatMoney(-event.amountCents, { showSign: true })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
