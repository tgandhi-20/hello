import React, { useMemo, useState } from 'react';
import { Search, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { EmptyState, Select, formatMoney, formatTxnAmount, formatRelativeDay, useToast, vibrate, TOAST_RESERVE_BOTTOM } from '@/ui';
import type { AccountId, Category, Txn } from '@/types';
import { currentMonth, monthLabel, nextMonth, prevMonth } from '@/features/insights/monthMath';
import { groupByDay, filterTxns } from './selectors';
import { useWindowedList } from './useWindowedList';
import { TransactionRow } from './TransactionRow';
import { EditSheet } from './EditSheet';
import { CategoryPickerSheet } from './CategoryPickerSheet';
import { UncategorisedQueue } from './UncategorisedQueue';

const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 40;

type Item =
  | { kind: 'header'; date: string; subtotalCents: number }
  | { kind: 'txn'; txn: Txn };

const ACCOUNT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Account' },
  { value: 'cash', label: 'Cash' },
  { value: 'cba', label: 'CBA' },
  { value: 'cba-card', label: 'CBA Card' },
  { value: 'bankwest', label: 'Bankwest' },
  { value: 'amex', label: 'Amex' },
];

export function TransactionsScreen() {
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const updateTxn = useStore((s) => s.updateTxn);
  const deleteTxn = useStore((s) => s.deleteTxn);
  const addTxn = useStore((s) => s.addTxn);
  const addRule = useStore((s) => s.addRule);
  const { show } = useToast();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [account, setAccount] = useState('');
  const [month, setMonth] = useState('');

  const [editing, setEditing] = useState<Txn | null>(null);
  const [recategorizing, setRecategorizing] = useState<Txn | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const t of txns) set.add(t.date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [txns]);

  // Month navigation (DESIGN-V3.md §5.4): `month === ''` means "All time" — search and
  // the category/account filters keep working unchanged in that state, they just AND
  // together with whichever month (or lack of one) is currently selected.
  const latestMonthWithData = months[0] ?? currentMonth();
  function goPrevMonth() {
    setMonth((m) => prevMonth(m || latestMonthWithData));
  }
  function goNextMonth() {
    setMonth((m) => {
      if (!m) return m; // already "All time" — nothing further ahead
      const next = nextMonth(m);
      return next > currentMonth() ? m : next; // never navigate into the future
    });
  }
  const nextDisabled = !month || month >= currentMonth();

  const filtered = useMemo(
    () =>
      filterTxns(txns, {
        query,
        categoryId: categoryId || null,
        account: (account || null) as AccountId | null,
        month: month || null,
      }),
    [txns, query, categoryId, account, month]
  );

  const items = useMemo<Item[]>(() => {
    const groups = groupByDay(filtered);
    const out: Item[] = [];
    for (const g of groups) {
      out.push({ kind: 'header', date: g.date, subtotalCents: g.subtotalCents });
      for (const t of g.txns) out.push({ kind: 'txn', txn: t });
    }
    return out;
  }, [filtered]);

  const { containerRef, visible, totalHeight } = useWindowedList(
    items,
    (item) => (item.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT)
  );

  async function handleDelete(txn: Txn) {
    vibrate('warning');
    await deleteTxn(txn.id);
    show(`Deleted ${formatMoney(Math.abs(txn.amountCents))}`, {
      variant: 'danger',
      durationMs: 5000,
      actionLabel: 'Undo',
      onAction: () => {
        void addTxn({
          date: txn.date,
          amountCents: txn.amountCents,
          description: txn.description,
          merchant: txn.merchant,
          categoryId: txn.categoryId,
          account: txn.account,
          source: txn.source,
          note: txn.note,
          excluded: txn.excluded,
          recurringId: txn.recurringId,
        });
      },
    });
  }

  async function applyRecategorize(txn: Txn, category: Category, remember: boolean) {
    await updateTxn(txn.id, { categoryId: category.id });
    if (remember) {
      const match = txn.merchant.trim().toLowerCase().split(' ').slice(0, 2).join(' ');
      if (match) await addRule(match, category.id);
    }
    vibrate('success');
    show(`Recategorised to ${category.label}`, { variant: 'success' });
  }

  if (txns.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        headline="No transactions yet"
        body="Log your first expense from the Add tab — it'll show up here, grouped by day."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 px-4 py-3">
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant, description or note"
            className="h-12 w-full rounded-control border border-hairline bg-surface-sunk pl-10 pr-4 text-md text-ink-1 placeholder:text-ink-3 outline-none focus:border-accent"
          />
        </label>

        {/* Month navigation (DESIGN-V3.md §5.4) — independent of search/category/account,
            so any combination of the four composes cleanly (see `filterTxns`). */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={goPrevMonth}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setMonth('')}
            aria-label={month ? `Showing ${monthLabel(month)} — tap for all time` : 'Showing all time'}
            className="min-h-[48px] flex-1 rounded-control px-3 text-center text-sm font-medium text-ink-1 active:bg-surface-sunk"
          >
            {month ? monthLabel(month) : 'All time'}
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={goNextMonth}
            disabled={nextDisabled}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk disabled:opacity-30"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Filter by category"
            options={[{ value: '', label: 'Category' }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />
          <Select
            aria-label="Filter by account"
            options={ACCOUNT_OPTIONS}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </div>

        <UncategorisedQueue
          txns={txns}
          categories={categories}
          onCategorize={(txn, category, remember) => void applyRecategorize(txn, category, remember)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} headline="No matches" body="Try a different search or clear your filters." />
      ) : (
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-y-auto scroll-container"
          style={{ overscrollBehavior: 'none', paddingBottom: TOAST_RESERVE_BOTTOM }}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visible.map(({ item, top }) => (
              <div key={item.kind === 'header' ? `h-${item.date}` : item.txn.id} style={{ position: 'absolute', top, left: 0, right: 0 }}>
                {item.kind === 'header' ? (
                  <div className="flex items-baseline justify-between px-4 py-2 text-xs text-ink-3">
                    <span>{formatRelativeDay(item.date)}</span>
                    <span className="money text-ink-3">{formatTxnAmount(item.subtotalCents)}</span>
                  </div>
                ) : (
                  <TransactionRow
                    txn={item.txn}
                    category={categoryById.get(item.txn.categoryId)}
                    onTap={setEditing}
                    onDelete={handleDelete}
                    onRecategorize={setRecategorizing}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <EditSheet
        txn={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => void updateTxn(id, patch)}
        onDelete={(txn) => void handleDelete(txn)}
        onRecategorize={(txn, category, remember) => void applyRecategorize(txn, category, remember)}
      />

      <CategoryPickerSheet
        open={Boolean(recategorizing)}
        onClose={() => setRecategorizing(null)}
        categories={categories}
        merchant={recategorizing?.merchant ?? ''}
        onPick={(category, remember) => {
          if (recategorizing) void applyRecategorize(recategorizing, category, remember);
        }}
      />
    </div>
  );
}
