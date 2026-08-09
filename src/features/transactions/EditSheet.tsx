import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet, Button, Input, Select, Switch, CategoryIcon, ConfirmDialog, formatMoney } from '@/ui';
import type { AccountId, Category, Txn } from '@/types';
import { bufferToCents, centsToBuffer } from '@/features/log';
import { CategoryPickerSheet } from './CategoryPickerSheet';

const ACCOUNT_OPTIONS: { value: AccountId; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'cba', label: 'CBA' },
  { value: 'cba-card', label: 'CBA Card' },
  { value: 'bankwest', label: 'Bankwest' },
  { value: 'amex', label: 'Amex' },
];

export interface EditSheetProps {
  txn: Txn | null;
  categories: Category[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<Txn>) => void;
  onDelete: (txn: Txn) => void;
  onRecategorize: (txn: Txn, category: Category, remember: boolean) => void;
}

/** Bottom-sheet editor for an existing transaction, opened by tapping a row. */
export function EditSheet({ txn, categories, onClose, onSave, onDelete, onRecategorize }: EditSheetProps) {
  const [amountBuf, setAmountBuf] = useState('');
  const [date, setDate] = useState('');
  const [account, setAccount] = useState<AccountId>('cash');
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!txn) return;
    setAmountBuf(centsToBuffer(Math.abs(txn.amountCents)));
    setDate(txn.date);
    setAccount(txn.account);
    setNote(txn.note ?? '');
    setExcluded(Boolean(txn.excluded));
  }, [txn]);

  if (!txn) return null;
  const category = categories.find((c) => c.id === txn.categoryId);
  const isIncome = txn.amountCents < 0;

  function commit() {
    if (!txn) return;
    const magnitude = bufferToCents(amountBuf);
    const amountCents = isIncome ? -magnitude : magnitude;
    onSave(txn.id, { amountCents, date, account, note: note.trim() || undefined, excluded });
    onClose();
  }

  return (
    <>
      <Sheet
        open={Boolean(txn)}
        onClose={onClose}
        title="Edit transaction"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteOpen(true)} aria-label="Delete">
              <Trash2 size={20} aria-hidden="true" />
            </Button>
            <Button fullWidth onClick={commit}>
              Save changes
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex min-h-[56px] items-center gap-3 rounded-card bg-surface-sunk px-4"
          >
            <CategoryIcon icon={category?.icon ?? 'Circle'} colorToken={category?.colorToken ?? 'cat-1'} size="sm" />
            <span className="flex-1 text-left text-md text-ink-1">{category?.label ?? 'Needs a category'}</span>
            <span className="text-xs text-ink-3">Change</span>
          </button>

          <label className="block">
            <span className="mb-1 block text-sm text-ink-2">Amount</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountBuf}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                setAmountBuf(cleaned);
              }}
              className="h-12 w-full rounded-control border border-hairline bg-surface-sunk px-4 text-md tabular-nums text-ink-1 outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-3">
              {isIncome ? 'Income' : 'Spend'} ·{' '}
              <span className="money text-ink-3">{formatMoney(bufferToCents(amountBuf))}</span>
            </span>
          </label>

          <Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />

          <Select
            label="Account"
            options={ACCOUNT_OPTIONS}
            value={account}
            onChange={(e) => setAccount(e.target.value as AccountId)}
          />

          <Input
            type="text"
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />

          <div className="flex flex-col gap-1 rounded-card bg-surface-sunk px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="txn-excluded" className="text-sm text-ink-1">
                Exclude from budgets &amp; insights
              </label>
              <Switch id="txn-excluded" checked={excluded} onChange={setExcluded} />
            </div>
            <p className="text-xs text-ink-3">
              Use for transfers between your own accounts or reimbursed expenses. Excluded transactions still
              appear in your history, but never count toward spend, budgets or what's left to spend.
            </p>
          </div>
        </div>
      </Sheet>

      <CategoryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        categories={categories}
        merchant={txn.merchant}
        onPick={(cat, remember) => {
          onRecategorize(txn, cat, remember);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this transaction?"
        body={`${category?.label ?? 'Needs a category'} · ${formatMoney(Math.abs(txn.amountCents))} on ${txn.date}`}
        /* Money in this dialog stays plain text — ConfirmDialog's `body` prop is a
           string, not JSX, so it can't carry the `.money` span; the amount is still
           tabular via the global body rule. */
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          onDelete(txn);
          onClose();
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
}
