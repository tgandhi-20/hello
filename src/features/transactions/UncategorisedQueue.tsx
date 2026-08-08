import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, X, PartyPopper } from 'lucide-react';
import { ListGroup, ListRow, Sheet, formatDate, formatMoney } from '@/ui';
import type { Category, Txn } from '@/types';
import { selectUncategorisedTxns } from './uncategorised';
import { CategoryPickerSheet } from './CategoryPickerSheet';

export interface UncategorisedQueueProps {
  txns: Txn[];
  categories: Category[];
  /** Same signature as `TransactionsScreen`'s own `applyRecategorize` — one tap on a
   *  category in the picker commits it (`remember` lets the user teach a merchant rule
   *  at the same time, same as everywhere else recategorising happens). */
  onCategorize: (txn: Txn, category: Category, remember: boolean) => void | Promise<void>;
}

/**
 * Self-contained "N imported transactions need a category" entry point
 * (DESIGN-V3.md §5.3 / §5 item 3): a dismissible banner that opens a fast
 * one-tap-per-row categorising pass. Exported standalone — with its own data
 * selector (`./uncategorised`) — so the separately-owned guided weekly-review
 * flow can drop it in as-is rather than re-deriving "what counts as
 * uncategorised" a second time.
 *
 * Dismissal is session-local (component state, not persisted) and
 * self-resets: if the queue grows again after being dismissed — a fresh
 * import lands more "Other" rows — it un-dismisses automatically rather than
 * silently hiding new work forever.
 */
export function UncategorisedQueue({ txns, categories, onCategorize }: UncategorisedQueueProps) {
  const items = useMemo(() => selectUncategorisedTxns(txns, categories), [txns, categories]);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Txn | null>(null);

  const seenCount = useRef(0);
  useEffect(() => {
    if (items.length > seenCount.current) setDismissed(false);
    seenCount.current = items.length;
  }, [items.length]);

  // Auto-close the pass once the last row is cleared — nothing left to show.
  useEffect(() => {
    if (open && items.length === 0) setOpen(false);
  }, [open, items.length]);

  if (items.length === 0 || dismissed) return null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-card bg-surface p-4 pr-14 text-left shadow-card active:bg-surface-sunk transition-colors duration-180 ease-standard"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-caution-tint">
            <Inbox size={20} strokeWidth={1.75} className="text-caution" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink-1">
              {items.length} imported transaction{items.length === 1 ? '' : 's'} need{items.length === 1 ? 's' : ''} a
              category
            </span>
            <span className="block text-xs text-ink-2">Tap to clear the queue, one tap per row</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="absolute right-1 top-1 flex h-12 w-12 items-center justify-center rounded-full text-ink-3 active:bg-surface-sunk"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <UncategorisedQueueSheet open={open} items={items} onClose={() => setOpen(false)} onRowTap={setActive} />

      <CategoryPickerSheet
        open={active !== null}
        onClose={() => setActive(null)}
        categories={categories}
        merchant={active?.merchant ?? ''}
        onPick={(category, remember) => {
          if (active) void onCategorize(active, category, remember);
          setActive(null);
        }}
      />
    </>
  );
}

interface UncategorisedQueueSheetProps {
  open: boolean;
  items: Txn[];
  onClose: () => void;
  onRowTap: (txn: Txn) => void;
}

/**
 * Kept as its own component purely so `UncategorisedQueue`'s top-level render stays
 * small and readable; not exported, since the parent's `onCategorize` prop is the
 * intended integration surface for reuse.
 */
function UncategorisedQueueSheet({ open, items, onClose, onRowTap }: UncategorisedQueueSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={`${items.length} to categorise`}>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <PartyPopper size={28} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
          <p className="text-sm text-ink-2">All caught up.</p>
        </div>
      ) : (
        <ListGroup>
          {items.map((t) => (
            <ListRow
              key={t.id}
              onClick={() => onRowTap(t)}
              title={t.merchant || t.description}
              subtitle={formatDate(t.date, 'short')}
              trailing={<span className="money text-ink-1">{formatMoney(t.amountCents)}</span>}
              chevron
            />
          ))}
        </ListGroup>
      )}
    </Sheet>
  );
}
