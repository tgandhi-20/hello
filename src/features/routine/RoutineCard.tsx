import React from 'react';
import { CalendarCheck2, Circle, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, formatRelativeDay } from '@/ui';
import { monthOf } from '@/ui/format';
import { resolveMonthlyItems, dueOrSoon } from './items';
import { useRoutineChecklist } from './useRoutineChecklist';

/** Look-ahead window for "due soon", matching the Recurring radar's own convention closely enough to feel consistent, but short — this is a monthly-discipline checklist, not a bills feed. */
const DUE_SOON_DAYS = 5;

/**
 * Compact dashboard card — PERSONAL.md §8 / deliverable 2. Shows only what's due today
 * or in the next few days from the monthly routine, with a one-tap tick. Deliberately
 * excludes the daily "log spending" item from this list — that one is "due" every
 * single day by design, and surfacing it here every day would mean this card can never
 * go quiet, which the brief explicitly asks it to be able to do. It still appears as a
 * small caption when there's nothing else due, and in full on the Routine screen
 * (`RoutineScreen`).
 *
 * Exported as `RoutineCard` (this exact name — the dashboard mounts it by it).
 */
export function RoutineCard(): React.JSX.Element | null {
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const { state, today, toggleItem } = useRoutineChecklist();

  if (!hydrated) return null;

  const month = monthOf(today);
  const resolved = resolveMonthlyItems(month, settings, state.current, today);
  const due = dueOrSoon(resolved, today, DUE_SOON_DAYS);

  if (due.length === 0) {
    return (
      <Card className="flex min-h-[48px] items-center gap-2 py-3 text-ink-3">
        <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
        <p className="text-xs">Routine's clear for now — keep logging spending as it happens.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-1">
        <CalendarCheck2 size={16} aria-hidden="true" /> This month's routine
      </h2>
      <ul className="flex flex-col divide-y divide-hairline">
        {due.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              aria-pressed={item.done}
              aria-label={`Mark "${item.label}" done`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
            >
              {/* No `--positive` token in v3 — "done" is carried by the filled check shape
                  plus full-strength ink, not a second green (DESIGN-V3.md §1). */}
              {item.done ? (
                <CheckCircle2 size={20} className="text-ink-1" aria-hidden="true" />
              ) : (
                <Circle size={20} aria-hidden="true" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink-1">{item.label}</p>
              <p className={['text-xs', item.overdue ? 'text-critical' : 'text-ink-3'].join(' ')}>
                {item.overdue ? `Overdue — was due ${formatRelativeDay(item.dueDate)}` : formatRelativeDay(item.dueDate)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
