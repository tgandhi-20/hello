import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, StickyNote } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, CategoryIcon, EmptyState, Select, SegmentedControl, formatMoney, formatRelativeDay, todayStr, addDays, useToast, vibrate, TOAST_RESERVE_BOTTOM } from '@/ui';
import type { AccountId, Category, DateStr } from '@/types';
import { CategoryGrid } from './CategoryTile';
import { Keypad, applyKey, bufferToCents, centsToBuffer } from './Keypad';
import { rankedCategories, suggestedAmountCents, lastUsedAccount } from './selectors';

const ACCOUNT_OPTIONS: { value: AccountId; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'cba', label: 'CBA' },
  { value: 'bankwest', label: 'Bankwest' },
  { value: 'amex', label: 'Amex' },
];

type DateChoice = 'today' | 'yesterday' | 'pick';

/**
 * Quick-add: the most important screen in the app. Category grid -> keypad -> save,
 * in as few taps as physically possible. Optional note/date/account live behind a
 * collapsed "Details" row so they never slow down the happy path.
 */
export function QuickAdd() {
  const categories = useStore((s) => s.categories);
  const txns = useStore((s) => s.txns);
  const pinnedCategoryIds = useStore((s) => s.settings.pinnedCategoryIds);
  const addTxn = useStore((s) => s.addTxn);
  const deleteTxn = useStore((s) => s.deleteTxn);
  const { show } = useToast();

  const [selected, setSelected] = useState<Category | null>(null);
  const [buffer, setBuffer] = useState('');
  const [note, setNote] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice>('today');
  const [customDate, setCustomDate] = useState<DateStr>(todayStr());
  const [account, setAccount] = useState<AccountId | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const ranked = useMemo(
    () => rankedCategories(categories, txns, pinnedCategoryIds),
    [categories, txns, pinnedCategoryIds]
  );

  const effectiveAccount = account ?? lastUsedAccount(txns);
  const effectiveDate =
    dateChoice === 'today' ? todayStr() : dateChoice === 'yesterday' ? addDays(todayStr(), -1) : customDate;

  const cents = bufferToCents(buffer);
  const suggestion = selected ? suggestedAmountCents(selected.id, txns) : null;

  function pickCategory(category: Category) {
    vibrate('tap');
    setSelected(category);
    const s = suggestedAmountCents(category.id, txns);
    setBuffer(s != null ? centsToBuffer(s) : '');
    setNote('');
    setDetailsOpen(false);
  }

  function backToGrid() {
    setSelected(null);
    setBuffer('');
  }

  async function save() {
    if (!selected || cents <= 0 || saving) return;
    setSaving(true);
    try {
      const label = note.trim() || selected.label;
      const txn = await addTxn({
        date: effectiveDate,
        amountCents: cents,
        description: label,
        merchant: label,
        categoryId: selected.id,
        account: effectiveAccount,
        source: 'manual',
        note: note.trim() || undefined,
      });
      vibrate('success');
      show(`Saved ${formatMoney(cents)} · ${selected.label}`, {
        variant: 'success',
        durationMs: 5000,
        actionLabel: 'Undo',
        onAction: () => {
          vibrate('warning');
          void deleteTxn(txn.id);
        },
      });
      // Reset for the next entry — quick-add is used many times back to back.
      setSelected(null);
      setBuffer('');
      setNote('');
      setDateChoice('today');
      setDetailsOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={StickyNote}
        headline="No categories yet"
        body="Categories will appear here once your budget is set up."
      />
    );
  }

  if (!selected) {
    return (
      // Reserve the toast's own footprint at the bottom of the grid — a save toast fires
      // after every single log (the app's most frequent interaction) and would otherwise
      // sit directly on top of the bottom row of tiles for its whole lifetime.
      <div className="flex flex-col gap-4 px-4 py-4" style={{ paddingBottom: TOAST_RESERVE_BOTTOM }}>
        <CategoryGrid categories={ranked} onSelect={pickCategory} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col px-4 py-4">
      <button
        type="button"
        onClick={backToGrid}
        className="mb-3 flex min-h-[48px] items-center gap-2 self-start text-sm font-medium text-text-2 active:text-text-1"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        Change category
      </button>

      <div className="mb-4 flex items-center gap-3">
        <CategoryIcon icon={selected.icon} colorToken={selected.colorToken} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-text-1">{selected.label}</p>
          {suggestion != null ? (
            <p className="text-sm text-text-2">Usual: {formatMoney(suggestion)}</p>
          ) : (
            <p className="text-sm text-text-2">First time logging this one</p>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-baseline justify-center">
        <span className="text-2xl font-semibold tabular-nums text-text-1">
          {buffer ? formatMoney(cents) : '$0.00'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mb-2 flex min-h-[48px] items-center justify-center gap-1 text-sm font-medium text-text-2 active:text-text-1"
      >
        {detailsOpen ? 'Hide details' : 'Note, date, account'}
        {detailsOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>

      {detailsOpen ? (
        <div className="mb-4 flex flex-col gap-3">
          <SegmentedControl
            options={[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'pick', label: 'Pick date' },
            ]}
            value={dateChoice}
            onChange={(v) => setDateChoice(v as DateChoice)}
          />
          {dateChoice === 'pick' ? (
            <input
              type="date"
              value={customDate}
              max={todayStr()}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-md text-text-1 outline-none focus:border-accent"
            />
          ) : (
            <p className="text-xs text-text-3">{formatRelativeDay(effectiveDate)}</p>
          )}
          <Select
            label="Account"
            options={ACCOUNT_OPTIONS}
            value={effectiveAccount}
            onChange={(e) => setAccount(e.target.value as AccountId)}
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            className="h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-md text-text-1 placeholder:text-text-3 outline-none focus:border-accent"
          />
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        <Keypad onKey={(k) => setBuffer((b) => applyKey(b, k))} disabledBackspace={!buffer} />
        <Button size="lg" fullWidth disabled={cents <= 0 || saving} onClick={() => void save()}>
          {cents > 0 ? `Save ${formatMoney(cents)}` : 'Enter an amount'}
        </Button>
      </div>
    </div>
  );
}
