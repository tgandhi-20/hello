import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Wallet, Wand2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, Card, EmptyState, ListGroup, formatMoney, useToast } from '@/ui';
import { currentMonth, daysRemainingInMonth, monthLabel, nextMonth, prevMonth } from '../insights/monthMath';
import { spendByCategoryLocal } from '../insights/selectors';
import { suggestBudgetsFromHistory } from './suggest';
import { BudgetRow } from './BudgetRow';

/**
 * Budgets — CONTRACTS.md §4: per-category monthly caps, month-by-month, copy-last-month,
 * "suggest budgets" from real spend history, remaining-per-day, calm/factual tone.
 */
export function BudgetsScreen() {
  const hydrated = useStore((s) => s.hydrated);
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const budgets = useStore((s) => s.budgets);
  const setBudget = useStore((s) => s.setBudget);
  const toast = useToast();

  const [month, setMonth] = useState(currentMonth());
  const [busy, setBusy] = useState(false);

  const spentByCategory = useMemo(() => spendByCategoryLocal(txns, month), [txns, month]);
  const limitByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of budgets) if (b.month === month) m.set(b.categoryId, b.limitCents);
    return m;
  }, [budgets, month]);

  const daysRemaining = daysRemainingInMonth(month);
  const totalBudget = Array.from(limitByCategory.values()).reduce((s, v) => s + v, 0);
  const totalSpent = Array.from(spentByCategory.values()).reduce((s, v) => s + v, 0);

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  const onCopyLastMonth = async () => {
    const last = prevMonth(month);
    const lastBudgets = budgets.filter((b) => b.month === last);
    if (lastBudgets.length === 0) {
      toast.show(`No budgets set in ${monthLabel(last)} to copy.`);
      return;
    }
    setBusy(true);
    try {
      for (const b of lastBudgets) {
        await setBudget(b.categoryId, month, b.limitCents);
      }
      toast.show(`Copied ${lastBudgets.length} budget${lastBudgets.length === 1 ? '' : 's'} from ${monthLabel(last)}.`, {
        variant: 'success',
      });
    } finally {
      setBusy(false);
    }
  };

  const onSuggest = async () => {
    const suggestions = suggestBudgetsFromHistory(txns, categories, month);
    const missing = Array.from(suggestions.entries()).filter(([id]) => !limitByCategory.has(id));
    if (missing.length === 0) {
      toast.show('Not enough spending history yet to suggest budgets.');
      return;
    }
    setBusy(true);
    try {
      for (const [categoryId, limitCents] of missing) {
        await setBudget(categoryId, month, limitCents);
      }
      toast.show(
        `Suggested ${missing.length} budget${missing.length === 1 ? '' : 's'} from your 3-month average.`,
        { variant: 'success' }
      );
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) return null;

  if (categories.length === 0) {
    return (
      <div className="px-4 py-8">
        <EmptyState icon={Wallet} headline="No categories yet" body="Categories will appear here once set up." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(prevMonth(month))}
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="text-md font-semibold text-ink-1">{monthLabel(month)}</h1>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(nextMonth(month))}
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <Card className="flex flex-col gap-1">
        <span className="label">Spent vs budgeted this month</span>
        {totalBudget > 0 ? (
          <p className="text-xl text-ink-1">
            <span className="money-hero">{formatMoney(totalSpent)}</span>{' '}
            <span className="text-sm text-ink-3">of</span>{' '}
            <span className="money-hero">{formatMoney(totalBudget)}</span>
          </p>
        ) : (
          <>
            <p className="text-xl text-ink-1">
              <span className="money-hero">{formatMoney(totalSpent)}</span>{' '}
              <span className="text-sm text-ink-3">spent</span>
            </p>
            <p className="text-sm text-ink-3">No budgets set yet — try Suggest budgets below.</p>
          </>
        )}
      </Card>

      <div className="flex gap-3">
        <Button variant="ghost" fullWidth onClick={onCopyLastMonth} disabled={busy}>
          <Copy size={16} aria-hidden="true" /> Copy last month
        </Button>
        <Button variant="ghost" fullWidth onClick={onSuggest} disabled={busy}>
          <Wand2 size={16} aria-hidden="true" /> Suggest budgets
        </Button>
      </div>

      <ListGroup className="p-4">
        {sortedCategories.map((cat) => (
          <BudgetRow
            key={cat.id}
            category={cat}
            limitCents={limitByCategory.get(cat.id) ?? 0}
            spentCents={spentByCategory.get(cat.id) ?? 0}
            daysRemaining={daysRemaining}
            onSave={(cents) => setBudget(cat.id, month, cents)}
          />
        ))}
      </ListGroup>
    </div>
  );
}
