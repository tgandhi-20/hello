import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, StickyNote } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, CategoryIcon, EmptyState, Input, Select, SegmentedControl, formatMoney, formatRelativeDay, todayStr, addDays, useToast, vibrate, TOAST_RESERVE_BOTTOM } from '@/ui';
import type { AccountId, Category, DateStr } from '@/types';
import { CategoryGrid } from './CategoryTile';
import { Keypad, applyKey, bufferToCents, centsToBuffer } from './Keypad';
import { rankedCategories, suggestedAmountCents, lastUsedAccount } from './selectors';

const ACCOUNT_OPTIONS: { value: AccountId; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'cba', label: 'CBA' },
  { value: 'cba-card', label: 'CBA Card' },
  { value: 'bankwest', label: 'Bankwest' },
  { value: 'amex', label: 'Amex' },
];

type DateChoice = 'today' | 'yesterday' | 'pick';

// Mirrors tailwind.config.js's `short:` breakpoint (max-height: 500px) — this needs the
// actual boolean in JS, not just a CSS class, because M1's other fix (the two-column
// `short:` layout) still wasn't enough on its own: `TOAST_RESERVE_BOTTOM` (160px) is a
// sensible amount of bottom clearance to keep a save-confirmation toast off the Save
// button on a normal phone, but reserving 160px of a 356px-tall content area (measured:
// 915x412) is most of the screen and pushed Save below the fold all over again even
// after the columns stopped competing for vertical space. A short viewport gets a much
// smaller reserve instead — safe-area only — since the compact layout doesn't pin
// controls to the very bottom edge the way the portrait layout does.
function useIsShortViewport(): boolean {
  const [isShort, setIsShort] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-height: 500px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-height: 500px)');
    const update = () => setIsShort(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isShort;
}

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
  const isShort = useIsShortViewport();

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
    // The ranked list already puts the fastest-to-reach categories first (pinned, then
    // most-used), but every tile carrying identical visual weight meant that ordering was
    // the *only* hierarchy signal — 18 identical tiles read as one undifferentiated grid.
    // Splitting into "Frequent" (thumb-reachable without scrolling) and "All categories"
    // gives this screen's one job — tap a category fast — a visibly dominant fast path,
    // using the same eyebrow-label pattern the rest of the app already uses for grouping
    // (see More's "Money"/"The plan"/"App" sections) rather than inventing a new one.
    const frequentCount = Math.min(Math.max(pinnedCategoryIds.length, 4), ranked.length);
    const frequent = ranked.slice(0, frequentCount);
    const rest = ranked.slice(frequentCount);
    return (
      // Reserve the toast's own footprint at the bottom of the grid — a save toast fires
      // after every single log (the app's most frequent interaction) and would otherwise
      // sit directly on top of the bottom row of tiles for its whole lifetime.
      <div className="flex flex-col gap-6 px-4 py-4" style={{ paddingBottom: TOAST_RESERVE_BOTTOM }}>
        <div className="flex flex-col gap-2">
          <span className="label px-1">Frequent</span>
          <CategoryGrid categories={frequent} onSelect={pickCategory} />
        </div>
        {rest.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="label px-1">All categories</span>
            <CategoryGrid categories={rest} onSelect={pickCategory} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    // Reserve the toast's own footprint here too — see the identical comment on the
    // category-grid view above. Quick-add is explicitly designed to be used "many
    // times back to back" (see `save()` above, which resets straight to this same
    // flow): the very next tap after a save routinely lands here, on THIS view, while
    // the previous save's toast is still showing. Without this padding the toast sat
    // directly on top of the Save button — for the app's single most frequent action,
    // on the one screen the P0 diagnosis exists to make trustworthy.
    // M1 fix: this used to be a single `h-full` + `mt-auto`-pushed-to-bottom column —
    // fine while everything above the keypad was short enough to leave room, but on a
    // short viewport (measured: 915x412 rotated phone) that stack simply doesn't fit and
    // the keypad/Save button rendered below the visible area. Two changes:
    //   1. `min-h-full` (not `h-full`) so this never clips its own content short of
    //      whatever `<main>` actually needs to scroll to reach it — scrolling stays a
    //      working fallback on any viewport too odd for the layout below to fully solve.
    //   2. At the `short` breakpoint (viewport height, not orientation — see
    //      tailwind.config.js), the amount/keypad stack becomes a two-column row instead
    //      of one tall column, so Save is reachable without scrolling at all in the
    //      measured case, not just "technically scrollable".
    <div
      className="flex min-h-full flex-col px-4 py-4 short:py-1"
      style={{ paddingBottom: isShort ? 'env(safe-area-inset-bottom)' : TOAST_RESERVE_BOTTOM }}
    >
      <button
        type="button"
        onClick={backToGrid}
        className="mb-3 short:mb-0 flex min-h-[48px] items-center gap-2 self-start text-sm font-medium text-ink-2 active:text-ink-1"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        Change category
      </button>

      <div className="flex flex-1 flex-col gap-1 short:flex-row short:items-center short:gap-4">
        <div className="flex flex-col short:min-w-0 short:flex-1 short:justify-center">
          <div className="mb-4 short:mb-2 flex items-center gap-3">
            <CategoryIcon icon={selected.icon} colorToken={selected.colorToken} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink-1">{selected.label}</p>
              {suggestion != null ? (
                <p className="text-sm text-ink-2">Usual: {formatMoney(suggestion)}</p>
              ) : (
                <p className="text-sm text-ink-2">First time logging this one</p>
              )}
            </div>
          </div>

          <div className="mb-4 short:mb-2 flex items-baseline justify-center short:justify-start">
            <span className="money-hero text-2xl text-ink-1">{buffer ? formatMoney(cents) : '$0.00'}</span>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="mb-2 short:mb-1 flex min-h-[48px] items-center justify-center gap-1 text-sm font-medium text-ink-2 active:text-ink-1 short:justify-start"
          >
            {detailsOpen ? 'Hide details' : 'Note, date, account'}
            {detailsOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>

          {detailsOpen ? (
            <div className="mb-4 flex flex-col gap-3 short:max-h-[30vh] short:overflow-y-auto short:pr-1">
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
                <Input
                  type="date"
                  value={customDate}
                  max={todayStr()}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              ) : (
                <p className="text-xs text-ink-3">{formatRelativeDay(effectiveDate)}</p>
              )}
              <Select
                label="Account"
                options={ACCOUNT_OPTIONS}
                value={effectiveAccount}
                onChange={(e) => setAccount(e.target.value as AccountId)}
              />
              <Input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional)"
              />
            </div>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-2 short:mt-0 short:min-w-0 short:flex-1 short:justify-center">
          <Keypad onKey={(k) => setBuffer((b) => applyKey(b, k))} disabledBackspace={!buffer} />
          {/* `short:h-12` keeps this at the 48px touch-target floor (CONTRACTS.md §4)
              rather than the usual `lg` 56px — every px matters at this breakpoint. */}
          <Button
            size="lg"
            fullWidth
            className="short:h-12"
            disabled={cents <= 0 || saving}
            onClick={() => void save()}
          >
            {cents > 0 ? <>Save <span className="money">{formatMoney(cents)}</span></> : 'Enter an amount'}
          </Button>
        </div>
      </div>
    </div>
  );
}
