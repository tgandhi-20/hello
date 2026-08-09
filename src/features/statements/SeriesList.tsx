import React, { useState } from 'react';
import { CheckCircle2, Circle, Repeat } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, EmptyState, ListGroup, ListRow, formatDate, formatMoney } from '@/ui';
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
          headline="No regular payments yet"
          body="Once Tally detects a repeating charge (rent, a subscription, a bill), confirm it here and link it to the card it hits."
        />
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink-2">
        <Repeat size={16} aria-hidden="true" /> Regular payments
      </h2>
      <ListGroup>
        {recurring.map((s) => (
          <ListRow
            key={s.id}
            onClick={() => setEditing(s)}
            leading={
              // No `--positive` token in v3 — "confirmed" is carried by the filled check
              // shape itself plus full-strength ink, not a second green (DESIGN-V3.md §1).
              s.confirmed ? (
                <CheckCircle2 size={18} className="text-ink-1" aria-hidden="true" />
              ) : (
                <Circle size={18} className="text-ink-3" aria-hidden="true" />
              )
            }
            title={s.merchant}
            subtitle={`${s.accountId ? ACCOUNT_LABEL[s.accountId] : 'No card linked'} · ${formatDate(s.nextDue, 'short')}${s.confirmed ? '' : ' · auto-detected'}`}
            trailing={<span className="money text-ink-1">{formatMoney(s.amountCents)}</span>}
          />
        ))}
      </ListGroup>
      <ConfirmSeriesSheet open={editing !== null} onClose={() => setEditing(null)} series={editing} />
    </section>
  );
}
