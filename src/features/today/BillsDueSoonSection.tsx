import React from 'react';
import { CalendarClock } from 'lucide-react';
import { EmptyState, ListGroup, ListRow, formatMoney, formatRelativeDay } from '@/ui';
import type { BillDueSoonItem } from './billsDueSoon';

export interface BillsDueSoonSectionProps {
  items: BillDueSoonItem[];
  /** Cap how many rows render before "+N more" — keeps Home to roughly two screens. */
  maxRows?: number;
}

/**
 * Home's third section (DESIGN-V4.md §1/§3) — ONE grouped list merging detected
 * recurring charges, card due dates, statement closes and payday, next 14 days.
 * Plain words: "Bills due soon", never "coming up" or "cashflow calendar".
 *
 * `--positive`/`--negative` don't exist in the v3 palette (no second green), so
 * cash-in rows (salary) aren't colour-coded — the `+` sign from `formatMoney`'s
 * `showSign` and the row's own label ("Salary") already say "money in" without
 * reaching for a second colour.
 */
export function BillsDueSoonSection({ items, maxRows = 6 }: BillsDueSoonSectionProps) {
  const shown = items.slice(0, maxRows);

  return (
    <section className="flex flex-col gap-2">
      <p className="label px-1">Bills due soon · next 14 days</p>
      {items.length === 0 ? (
        <ListGroup>
          <EmptyState
            icon={CalendarClock}
            headline="Nothing due in the next 14 days"
            body="Regular payments, card due dates, card balance updates and payday show up here once Tally has learned them."
            className="py-6"
          />
        </ListGroup>
      ) : (
        <>
          <ListGroup>
            {shown.map((item) => (
              <ListRow
                key={item.id}
                as="div"
                leading={
                  <span className="flex h-8 min-w-[52px] shrink-0 items-center justify-center rounded-pill bg-surface-sunk px-2 text-xs font-medium text-ink-2">
                    {formatRelativeDay(item.date)}
                  </span>
                }
                title={item.label}
                subtitle={item.certainty === 'predicted' ? "We think — not confirmed yet" : undefined}
                trailing={
                  item.amountCents === null ? undefined : item.amountCents === 0 ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    <span className="money text-ink-1">{formatMoney(-item.amountCents, { showSign: true })}</span>
                  )
                }
              />
            ))}
          </ListGroup>
          {items.length > maxRows ? (
            <p className="px-1 text-xs text-ink-3">+{items.length - maxRows} more in the next 14 days</p>
          ) : null}
        </>
      )}
    </section>
  );
}
