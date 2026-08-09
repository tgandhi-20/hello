import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarCheck2, CreditCard, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ListGroup, ListRow, formatMoney } from '@/ui';
import type { ToSortOutItem, ToSortOutKind } from './toSortOut';

const ICON_BY_KIND: Record<ToSortOutKind, LucideIcon> = {
  uncategorised: AlertCircle,
  'price-rise': TrendingUp,
  'unconfirmed-cycle': CreditCard,
  routine: CalendarCheck2,
};

export interface ToSortOutSectionProps {
  items: ToSortOutItem[];
}

/**
 * Home's fifth section (DESIGN-V4.md §1/§3) — renders ONLY when `items` is
 * non-empty. "A section with nothing to say must not render": this component
 * returns `null` outright for an empty list rather than rendering an empty
 * heading or an empty-state illustration — unlike every other section on Home,
 * "nothing to say" here means genuinely nothing, not a friendly placeholder.
 */
export function ToSortOutSection({ items }: ToSortOutSectionProps) {
  const navigate = useNavigate();
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="label px-1">To sort out</p>
      <ListGroup>
        {items.map((item) => {
          const Icon = ICON_BY_KIND[item.kind];
          return (
            <ListRow
              key={item.id}
              onClick={() => navigate(item.to)}
              leading={
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunk">
                  <Icon size={16} className="text-ink-2" aria-hidden="true" />
                </span>
              }
              title={item.title}
              subtitle={item.subtitle}
              trailing={
                item.amountCents === undefined ? undefined : (
                  <span className="money text-ink-1">{formatMoney(item.amountCents)}</span>
                )
              }
              chevron
            />
          );
        })}
      </ListGroup>
    </section>
  );
}
