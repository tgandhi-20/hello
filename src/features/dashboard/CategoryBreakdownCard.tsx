import React from 'react';
import { PieChart } from 'lucide-react';
import type { Category, Txn } from '@/types';
import { Card, CategoryIcon, EmptyState, formatMoney } from '@/ui';
import { Donut, BarList } from '@/charts';
import type { ChartDatum } from '@/charts';

export interface CategoryBreakdownCardProps {
  txns: Txn[];
  categories: Category[];
}

/** Groups this month's spend by category. Local, not a dependency on the store's `spendByCategory`
 * selector shape (unspecified beyond its name in CONTRACTS.md §9) — grouping straight from txns
 * keeps this card correct regardless of how Agent 2 ultimately shapes that selector's return value. */
function groupSpendByCategory(txns: Txn[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of txns) {
    if (t.excluded || t.amountCents <= 0) continue;
    out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return out;
}

export function CategoryBreakdownCard({ txns, categories }: CategoryBreakdownCardProps) {
  const byCategory = groupSpendByCategory(txns);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const data: ChartDatum[] = Array.from(byCategory.entries()).map(([categoryId, value]) => {
    const cat = catMap.get(categoryId);
    return {
      id: categoryId,
      label: cat?.label ?? 'Uncategorised',
      value,
      colorToken: cat?.colorToken,
    };
  });

  if (data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={PieChart}
          headline="No spending yet this month"
          body="Once you log or import a transaction, your category breakdown shows up here."
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-md font-semibold text-text-1">Where it's going</h2>
      <div className="flex items-center gap-5">
        <Donut data={data} size={148} centerLabel="This month" formatValue={(v) => formatMoney(v)} />
        <div className="min-w-0 flex-1">
          <BarList
            data={data}
            maxItems={4}
            formatValue={(v) => formatMoney(v)}
            renderLeading={(d) => {
              const cat = catMap.get(d.id);
              return cat ? <CategoryIcon icon={cat.icon} colorToken={cat.colorToken} size="sm" /> : null;
            }}
          />
        </div>
      </div>
    </Card>
  );
}
