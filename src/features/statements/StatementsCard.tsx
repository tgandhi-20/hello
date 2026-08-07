import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { Card, formatDate, formatMoney } from '@/ui';
import type { CurrentCycleBalance } from './balance';
import { useStatementsOverview } from './useStatementsOverview';
import { ACCOUNT_LABEL, CARD_ACCOUNT_IDS } from './types';

/**
 * Compact dashboard card — "tell me my expense without actually opening
 * credit card". Shows each card's building statement total and payment due
 * date, soonest-due first. Exported as `StatementsCard` for the dashboard to
 * mount, mirroring `RoutineCard`'s pattern.
 */
export function StatementsCard(): React.JSX.Element | null {
  const navigate = useNavigate();
  const { hydrated, balances, hasAnyCardData } = useStatementsOverview();

  if (!hydrated) return null;

  if (!hasAnyCardData) {
    return (
      <Card className="flex min-h-[48px] items-center gap-2 py-3 text-ink-3">
        <CreditCard size={16} aria-hidden="true" className="shrink-0" />
        <p className="text-xs">Import a card statement and Tally will start predicting your bill and payment dates here.</p>
      </Card>
    );
  }

  const rows = CARD_ACCOUNT_IDS.map((id) => balances[id]).filter((b): b is CurrentCycleBalance => Boolean(b));
  rows.sort((a, b) => {
    if (a.status !== 'ok' && b.status !== 'ok') return 0;
    if (a.status !== 'ok') return 1;
    if (b.status !== 'ok') return -1;
    return (a.paymentDueDate ?? '') < (b.paymentDueDate ?? '') ? -1 : 1;
  });

  const anyStale = rows.some((b) => b.stale);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-1">
          <CreditCard size={16} aria-hidden="true" /> Statements
        </h2>
        <button
          type="button"
          onClick={() => navigate('/statements')}
          className="flex min-h-[48px] items-center px-2 text-xs font-medium text-accent"
        >
          See all
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-hairline">
        {rows.map((b) => (
          <li key={b.accountId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-1">{ACCOUNT_LABEL[b.accountId]}</p>
              <p className="text-xs text-ink-3">
                {b.status === 'ok'
                  ? `${b.paymentDueDate ? `Due ${formatDate(b.paymentDueDate, 'long')}` : 'Due date unknown'}${b.stale ? ' · stale' : ''}`
                  : 'Statement cycle not learned yet'}
              </p>
            </div>
            {b.status === 'ok' ? (
              <span className="money shrink-0 text-md text-ink-1">{formatMoney(b.projectedTotalCents)}</span>
            ) : (
              <span className="shrink-0 text-xs text-ink-3">Unknown</span>
            )}
          </li>
        ))}
      </ul>

      {anyStale ? (
        <p className="flex items-center gap-1.5 text-xs text-caution">
          <AlertTriangle size={12} aria-hidden="true" className="shrink-0" /> Some totals are based on data that hasn't been
          imported recently — see Statements for details.
        </p>
      ) : null}
    </Card>
  );
}
