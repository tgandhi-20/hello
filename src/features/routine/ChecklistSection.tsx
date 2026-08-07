import React from 'react';
import { Circle, CheckCircle2, Coffee } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, formatDate } from '@/ui';
import { monthOf } from '@/ui/format';
import { resolveMonthlyItems, resolveDailyItem } from './items';
import { useRoutineChecklist } from './useRoutineChecklist';
import type { ResolvedMonthlyRoutineItem } from './types';

function statusLabel(item: ResolvedMonthlyRoutineItem, today: string): { text: string; tone: 'positive' | 'negative' | 'accent' | 'muted' } {
  if (item.done) return { text: 'Done', tone: 'positive' };
  if (item.overdue) return { text: `Overdue — was due ${formatDate(item.dueDate, 'long')}`, tone: 'negative' };
  if (item.dueDate === today) return { text: 'Due today', tone: 'accent' };
  return { text: `Due ${formatDate(item.dueDate, 'long')}`, tone: 'muted' };
}

const TONE_CLASSES: Record<string, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  accent: 'text-accent',
  muted: 'text-ink-2',
};

/**
 * The full monthly routine — all five items, every month, plus the daily logging
 * reminder. Unlike `RoutineCard` this shows everything regardless of how soon it's
 * due, since a user who navigates here has explicitly asked to see the whole picture.
 */
export function ChecklistSection(): React.JSX.Element | null {
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const { state, today, toggleItem, toggleLoggedToday } = useRoutineChecklist();

  if (!hydrated) return null;

  const month = monthOf(today);
  const items = resolveMonthlyItems(month, settings, state.current, today);
  const daily = resolveDailyItem(state.current, today);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-md font-semibold text-ink-1">This month's routine</h2>
      <ul className="flex flex-col divide-y divide-hairline">
        {items.map((item) => {
          const status = statusLabel(item, today);
          return (
            <li key={item.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-pressed={item.done}
                  aria-label={`Mark "${item.label}" done`}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
                >
                  {item.done ? (
                    <CheckCircle2 size={22} className="text-positive" aria-hidden="true" />
                  ) : (
                    <Circle size={22} aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-1">{item.label}</p>
                  <p className="truncate text-xs text-ink-3">{item.detail}</p>
                </div>
              </div>
              <p className={['pl-[60px] text-xs font-medium', TONE_CLASSES[status.tone]].join(' ')}>
                {status.text}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3 rounded-card bg-surface-2 px-3 py-3">
        <button
          type="button"
          onClick={toggleLoggedToday}
          aria-pressed={daily.done}
          aria-label="Mark today's spending as logged"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-1"
        >
          {daily.done ? (
            <CheckCircle2 size={22} className="text-positive" aria-hidden="true" />
          ) : (
            <Coffee size={22} aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-1">Log spending — daily</p>
          <p className="text-xs text-ink-3">{daily.detail}</p>
        </div>
      </div>
    </Card>
  );
}
