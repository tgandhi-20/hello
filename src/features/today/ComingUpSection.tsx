import React from 'react';
import { CalendarClock } from 'lucide-react';
import { EmptyState, ListGroup, ListRow, formatMoney, formatRelativeDay } from '@/ui';
import type { ComingUpItem } from './comingUp';

export interface ComingUpSectionProps {
  items: ComingUpItem[];
  /** Cap how many rows render before "+N more" — keeps Today to roughly two screens. */
  maxRows?: number;
}

/**
 * Today's third section (DESIGN-V3.md §4.3) — ONE grouped list merging
 * detected recurring charges, card due dates, statement closes and payday.
 * Each row: date chip, name, amount. Replaces three separate cards from the
 * old ten-card Home (recurring preview, upcoming bills, statements preview).
 *
 * `--positive`/`--negative` don't exist in DESIGN-V3's palette (§1: "no
 * positive green — a second green would collide with --accent"), so cash-in
 * rows (salary) aren't colour-coded — the `+` sign from `formatMoney`'s
 * `showSign` and the row's own label ("Salary") already say "money in"
 * without reaching for a second colour.
 */
export function ComingUpSection({ items, maxRows = 6 }: ComingUpSectionProps) {
  const shown = items.slice(0, maxRows);

  return (
    <section className="flex flex-col gap-2">
      <p className="label px-1">Coming up · next 14 days</p>
      {items.length === 0 ? (
        <ListGroup>
          <EmptyState
            icon={CalendarClock}
            headline="Nothing due in the next 14 days"
            body="Recurring bills, card due dates, statement closes and payday show up here once Tally has learned them."
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
                subtitle={item.certainty === 'predicted' ? 'Predicted' : undefined}
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
            <p className="px-1 text-xs text-ink-3">+{items.length - maxRows} more in the next 14 days — see Plan</p>
          ) : null}
        </>
      )}
    </section>
  );
}
