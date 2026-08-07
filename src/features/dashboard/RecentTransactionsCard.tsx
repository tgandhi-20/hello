import React from 'react';
import { Receipt } from 'lucide-react';
import type { Category, Txn } from '@/types';
import { Card, CategoryIcon, EmptyState, formatMoney, formatRelativeDay } from '@/ui';

export interface RecentTransactionsCardProps {
  txns: Txn[];
  categories: Category[];
  limit?: number;
}

/** Read-only preview of the most recent transactions — the full editable list belongs to Agent 4. */
export function RecentTransactionsCard({ txns, categories, limit = 5 }: RecentTransactionsCardProps) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const recent = txns.filter((t) => !t.excluded).slice(0, limit);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-md font-semibold text-text-1">Recent</h2>
      {recent.length === 0 ? (
        <EmptyState
          icon={Receipt}
          headline="No transactions yet"
          body="Log a purchase or import a statement to see it show up here."
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {recent.map((t) => {
            const cat = catMap.get(t.categoryId);
            const income = t.amountCents < 0;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <CategoryIcon icon={cat?.icon ?? 'Circle'} colorToken={cat?.colorToken ?? 'text-3'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-1">{t.merchant || t.description}</p>
                  <p className="text-xs text-text-3">
                    {cat?.label ?? 'Uncategorised'} · {formatRelativeDay(t.date)}
                  </p>
                </div>
                <span
                  className={['tabular-nums shrink-0 text-sm font-medium', income ? 'text-positive' : 'text-text-1'].join(
                    ' '
                  )}
                >
                  {formatMoney(t.amountCents < 0 ? -t.amountCents : t.amountCents, { showSign: income })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {txns.length > limit ? (
        <p className="text-xs text-text-3">+{txns.length - limit} more this month</p>
      ) : null}
    </Card>
  );
}
