import React, { useMemo } from 'react';
import { Receipt, UtensilsCrossed } from 'lucide-react';
import { EmptyState, ListGroup, ListRow, CategoryIcon, formatMoney } from '@/ui';
import { FOOD_GROUP_CATEGORY_IDS } from '@/personal/plan';
import type { MonthMoney, MonthMoneyCategoryRow } from '@/money';

export interface WhereItWentSectionProps {
  money: MonthMoney;
}

const FOOD_IDS: ReadonlySet<string> = new Set(FOOD_GROUP_CATEGORY_IDS);

/**
 * Home's second section (DESIGN-V4.md §1) — the category breakdown of `spent`,
 * largest first, with the food line carrying its weekly target. Every figure
 * here comes straight from `money.byCategory` / `money.foodThisWeek` — this
 * component groups and formats, it never computes a total of its own.
 *
 * The four food categories (groceries, eating-out, lunch, coffee) merge into
 * ONE "Food" row so the list stays legible — their combined monthly spend is
 * still exactly the sum of those four `byCategory` entries, so the merge
 * cannot change the total. That row's subtitle is `money.foodThisWeek` — this
 * WEEK's food spend against the $141 target (PERSONAL.md §4), because a monthly
 * total would hide the weekly damage the plan explicitly tracks against.
 *
 * A "Total" row at the bottom sums back to `money.spentCents` — the same
 * figure the equation above calls "already spent" — so the addition is visibly
 * checkable, not just true by construction.
 */
export function WhereItWentSection({ money }: WhereItWentSectionProps) {
  const { foodRow, otherRows } = useMemo(() => groupByFood(money.byCategory), [money.byCategory]);

  const rows: { key: string; row: MonthMoneyCategoryRow | null }[] =
    foodRow && foodRow.spentCents > 0 ? [{ key: 'food', row: foodRow }] : [];
  for (const row of otherRows) rows.push({ key: row.categoryId, row });
  rows.sort((a, b) => (b.row?.spentCents ?? 0) - (a.row?.spentCents ?? 0));

  return (
    <section className="flex flex-col gap-2">
      <p className="label px-1">Where it went</p>
      {money.spentCents === 0 ? (
        <ListGroup>
          <EmptyState
            icon={Receipt}
            headline="Nothing logged yet this month"
            body="Spending you log or import shows up here, biggest category first."
            className="py-6"
          />
        </ListGroup>
      ) : (
        <ListGroup>
          {rows.map(({ key, row }) =>
            row === null ? null : key === 'food' ? (
              <ListRow
                key={key}
                as="div"
                leading={
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
                    <UtensilsCrossed size={16} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
                  </span>
                }
                title="Food"
                subtitle={`${formatMoney(money.foodThisWeek.spentCents)} of ${formatMoney(
                  money.foodThisWeek.targetCents
                )} this week`}
                trailing={<span className="money text-ink-1">{formatMoney(row.spentCents)}</span>}
              />
            ) : (
              <ListRow
                key={key}
                as="div"
                // `byCategory` rows carry a colour token but not a category icon (that
                // lives on the full `Category` record, which this section deliberately
                // doesn't look up twice — the icon here is decorative). A neutral
                // circle in the category's own colour keeps every row visually
                // consistent without a second category lookup.
                leading={<CategoryIcon icon="Circle" colorToken={row.colorToken} size="sm" />}
                title={row.label}
                trailing={<span className="money text-ink-1">{formatMoney(row.spentCents)}</span>}
              />
            )
          )}
          <ListRow
            as="div"
            title="Total"
            trailing={<span className="money font-semibold text-ink-1">{formatMoney(money.spentCents)}</span>}
            className="border-t border-hairline"
          />
        </ListGroup>
      )}
    </section>
  );
}

function groupByFood(byCategory: readonly MonthMoneyCategoryRow[]): {
  foodRow: MonthMoneyCategoryRow | null;
  otherRows: MonthMoneyCategoryRow[];
} {
  let foodSpentCents = 0;
  const otherRows: MonthMoneyCategoryRow[] = [];
  for (const row of byCategory) {
    if (FOOD_IDS.has(row.categoryId)) {
      foodSpentCents += row.spentCents;
    } else {
      otherRows.push(row);
    }
  }
  const foodRow: MonthMoneyCategoryRow | null =
    foodSpentCents > 0 ? { categoryId: 'food-group', label: 'Food', colorToken: 'accent', spentCents: foodSpentCents } : null;
  return { foodRow, otherRows };
}
