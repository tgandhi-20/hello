import React, { useState } from 'react';
import { CreditCard, Pencil } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, Card, Input, formatDate, formatMoney } from '@/ui';
import type { AccountId } from '@/types';
import type { CurrentCycleBalance } from './balance';
import { ConfidenceBadge } from './ConfidenceBadge';
import { ACCOUNT_LABEL } from './types';

export interface CardCycleSectionProps {
  accountId: AccountId;
  balance: CurrentCycleBalance;
}

/**
 * Per-card detail — "what will this statement be?" (deliverable 2), plus the
 * cycle override editor (deliverable 1: "let the user override, and persist
 * the override"). Persists through the frozen §9 `updateSettings` call —
 * never touches IndexedDB directly.
 */
export function CardCycleSection({ accountId, balance }: CardCycleSectionProps) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [editing, setEditing] = useState(false);
  const [closingDay, setClosingDay] = useState(String(balance.cycle.closingDay ?? ''));
  const [dueDay, setDueDay] = useState(String(balance.cycle.dueDay ?? ''));

  function saveOverride(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(closingDay);
    const d = Number(dueDay);
    if (!Number.isFinite(c) || !Number.isFinite(d) || c < 1 || c > 31 || d < 1 || d > 31) return;
    void updateSettings({
      statementCycles: {
        ...settings.statementCycles,
        [accountId]: { closingDay: Math.round(c), dueDay: Math.round(d), setAt: Date.now() },
      },
    });
    setEditing(false);
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-1">
          <CreditCard size={16} aria-hidden="true" /> {ACCOUNT_LABEL[accountId]}
        </h2>
        <ConfidenceBadge
          level={balance.cycle.dueDayConfidence}
          sourceLabel={balance.cycle.source === 'user-override' ? 'You set this' : undefined}
        />
      </div>

      {balance.status === 'insufficient-history' ? (
        <p className="text-sm text-ink-2">{balance.note}</p>
      ) : (
        <>
          <div>
            <p className="text-2xs uppercase tracking-wide text-ink-3">This statement so far</p>
            <p className="money-hero text-2xl text-ink-1">{formatMoney(balance.projectedTotalCents)}</p>
            <p className="text-xs text-ink-2">
              {formatMoney(balance.closedToDateCents)} charged so far
              {balance.projectedAdditionalCents > 0 ? ` + ${formatMoney(balance.projectedAdditionalCents)} expected` : ''}
            </p>
          </div>

          {balance.paymentDueDate ? (
            <p className="text-sm text-ink-2">
              Payment due <span className="font-medium text-ink-1">{formatDate(balance.paymentDueDate, 'long')}</span>
            </p>
          ) : null}

          {balance.projectedItems.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {balance.projectedItems.map((item) => (
                <li key={item.seriesId} className="flex items-center justify-between gap-2 py-1.5 text-xs text-ink-2">
                  <span className="min-w-0 truncate">
                    {item.merchant} · {formatDate(item.dueDate, 'short')}
                    {item.confirmed ? '' : ' (auto-detected)'}
                  </span>
                  <span className="money shrink-0 text-ink-1">{formatMoney(item.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className={['text-xs', balance.stale ? 'text-caution' : 'text-ink-3'].join(' ')}>{balance.note}</p>
        </>
      )}

      {editing ? (
        <form onSubmit={saveOverride} className="flex items-end gap-2">
          <Input
            label="Closing day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
            className="flex-1"
          />
          <Input
            label="Due day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="md">
            Save
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-[48px] items-center gap-1.5 self-start text-xs text-ink-3 underline decoration-dotted underline-offset-4"
        >
          <Pencil size={12} aria-hidden="true" />{' '}
          {balance.cycle.closingDay != null ? 'Correct these dates' : 'Set these dates yourself'}
        </button>
      )}
    </Card>
  );
}
