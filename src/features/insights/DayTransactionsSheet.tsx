import React from 'react';
import { Receipt } from 'lucide-react';
import type { Category, DayCell, Txn } from '@/types';
import { CategoryIcon, EmptyState, Sheet, formatDate, formatMoney } from '@/ui';

export interface DayTransactionsSheetProps {
  day: DayCell | null;
  txns: Txn[];
  categories: Category[];
  onClose: () => void;
}

/** Bottom sheet listing one day's transactions, opened by tapping a cell in the heatmap. */
export function DayTransactionsSheet({ day, txns, categories, onClose }: DayTransactionsSheetProps) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const dayTxns = day ? txns.filter((t) => t.date === day.date && !t.excluded) : [];

  return (
    <Sheet open={day !== null} onClose={onClose} title={day ? formatDate(day.date, 'long') : undefined}>
      {dayTxns.length === 0 ? (
        <EmptyState icon={Receipt} headline="Nothing logged this day" className="py-6" />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {dayTxns.map((t) => {
            const cat = catMap.get(t.categoryId);
            const income = t.amountCents < 0;
            return (
              <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <CategoryIcon icon={cat?.icon ?? 'Circle'} colorToken={cat?.colorToken ?? 'ink-3'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-1">{t.merchant || t.description}</p>
                  <p className="text-xs text-ink-3">{cat?.label ?? 'Uncategorised'}</p>
                </div>
                {/* No `--positive` token in v3 — income is carried by the `+` sign
                    (`showSign`), not a second green competing with the accent. */}
                <span className="money shrink-0 text-sm text-ink-1">
                  {formatMoney(t.amountCents < 0 ? -t.amountCents : t.amountCents, { showSign: income })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
