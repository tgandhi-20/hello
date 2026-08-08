import React, { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button, Input, Select, Sheet } from '@/ui';
import type { AccountId, RecurringCadence, RecurringSeries } from '@/types';
import { confirmSeries, replaceSeries } from './confirmSeries';
import { ACCOUNT_LABEL } from './types';

const CADENCE_OPTIONS: { value: RecurringCadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const ACCOUNT_OPTIONS: { value: AccountId | ''; label: string }[] = [
  { value: '', label: 'Not linked' },
  { value: 'cba', label: ACCOUNT_LABEL.cba },
  { value: 'cba-card', label: ACCOUNT_LABEL['cba-card'] },
  { value: 'bankwest', label: ACCOUNT_LABEL.bankwest },
  { value: 'amex', label: ACCOUNT_LABEL.amex },
  { value: 'cash', label: ACCOUNT_LABEL.cash },
];

export interface ConfirmSeriesSheetProps {
  open: boolean;
  onClose: () => void;
  series: RecurringSeries | null;
}

/**
 * Confirm/edit a detected recurring series — the user's own ask, "can
 * recurring transactions be saved too". Sets amount, cadence, next due,
 * category and (crucially) which account/card it hits, then persists via the
 * frozen §9 `setRecurring` call. Once confirmed, `detectRecurring` treats
 * these fields as authoritative (see recurring/detect.ts's doc comment).
 */
export function ConfirmSeriesSheet({ open, onClose, series }: ConfirmSeriesSheetProps) {
  const recurring = useStore((s) => s.recurring);
  const categories = useStore((s) => s.categories);
  const setRecurring = useStore((s) => s.setRecurring);

  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<RecurringCadence>('monthly');
  const [nextDue, setNextDue] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState<AccountId | ''>('');

  useEffect(() => {
    if (!series) return;
    setAmount((series.amountCents / 100).toFixed(2));
    setCadence(series.cadence);
    setNextDue(series.nextDue);
    setCategoryId(series.categoryId);
    setAccountId(series.accountId ?? '');
  }, [series]);

  if (!series) return null;

  function save() {
    if (!series) return;
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0 || !nextDue) return;
    const updated = confirmSeries(series, {
      amountCents: cents,
      cadence,
      nextDue,
      categoryId: categoryId || series.categoryId,
      accountId: accountId || undefined,
    });
    void setRecurring(replaceSeries(recurring, updated));
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Confirm this series"
      footer={
        <Button fullWidth onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-sm text-ink-2">{series.merchant}</p>

        <Input
          label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />

        <Select
          label="Repeats"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as RecurringCadence)}
          options={CADENCE_OPTIONS}
        />

        <Input label="Next due" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />

        {categories.length > 0 ? (
          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={categories.map((c) => ({ value: c.id, label: c.label }))}
          />
        ) : null}

        <Select
          label="Which account/card does this hit?"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value as AccountId | '')}
          options={ACCOUNT_OPTIONS}
        />

        <p className="text-xs text-ink-3">
          Confirming locks these details in — Tally won't silently overwrite them again, even if a future
          transaction looks a little different. Linking a card is what lets Tally count this charge toward
          that card's predicted statement.
        </p>
      </div>
    </Sheet>
  );
}
