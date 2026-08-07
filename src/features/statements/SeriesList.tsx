import React, { useState } from 'react';
import { CheckCircle2, Circle, Repeat } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, EmptyState, formatDate, formatMoney } from '@/ui';
import type { RecurringSeries } from '@/types';
import { ConfirmSeriesSheet } from './ConfirmSeriesSheet';
import { ACCOUNT_LABEL } from './types';

/**
 * Every detected + confirmed recurring series, tap-to-confirm/edit. This is
 * the "save recurring transactions" surface — a confirmed (checked) series
 * is durable per `recurring/detect.ts`'s preservation guarantee.
 */
export function SeriesList() {
  const recurring = useStore((s) => s.recurring);
  const [editing, setEditing] = useState<RecurringSeries | null>(null);

  if (recurring.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Repeat}
          headline="No recurring series yet"
          body="Once Tally detects a repeating charge (rent, a subscription, a bill), confirm it here and link it to the card it hits."
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-1">
        <Repeat size={16} aria-hidden="true" /> Recurring series
      </h2>
      <ul className="flex flex-col divide-y divide-hairline">
        {recurring.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setEditing(s)}
              className="flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left"
            >
              <span className="shrink-0 text-ink-2">
                {s.confirmed ? (
                  <CheckCircle2 size={18} className="text-positive" aria-hidden="true" />
                ) : (
                  <Circle size={18} aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-1">{s.merchant}</p>
                <p className="text-xs text-ink-3">
                  {s.accountId ? ACCOUNT_LABEL[s.accountId] : 'No card linked'} · {formatDate(s.nextDue, 'short')}
                  {s.confirmed ? '' : ' · auto-detected'}
                </p>
              </div>
              <span className="money shrink-0 text-sm text-ink-1">{formatMoney(s.amountCents)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ConfirmSeriesSheet open={editing !== null} onClose={() => setEditing(null)} series={editing} />
    </Card>
  );
}
