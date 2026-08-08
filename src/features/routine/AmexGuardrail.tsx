import React, { useState } from 'react';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, Button, Input, formatDate } from '@/ui';
import { monthOf } from '@/ui/format';
import { nthDayOfMonth, firstSaturdayOfMonth } from './dates';
import { DEFAULT_AMEX_DUE_DAY_OF_MONTH, AMEX_INTEREST_RATE_PCT } from './planExtras';
import { useRoutineChecklist } from './useRoutineChecklist';

/**
 * The Amex guardrail — PERSONAL.md §8 / deliverable 3. "Never carry a credit card
 * balance." Tied to two dates: the Amex due day itself (configurable — PERSONAL.md
 * §6's "11 Aug" was that month's instance, not a fixed rule, so it's a `Settings`
 * field with a default, not a literal) and the first-Saturday statement review.
 *
 * Honesty boundary (deliverable 3 is explicit about this): Tally has transactions,
 * not a card balance. This component never claims to know whether Amex has been paid
 * — only whether the user ticked it. The copy says so plainly rather than implying a
 * check that didn't happen.
 */
export function AmexGuardrail(): React.JSX.Element | null {
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const { state, today, toggleItem } = useRoutineChecklist();
  const [editingDueDay, setEditingDueDay] = useState(false);
  const dueDay = settings.amexDueDayOfMonth ?? DEFAULT_AMEX_DUE_DAY_OF_MONTH;
  const [draftDueDay, setDraftDueDay] = useState(String(dueDay));

  if (!hydrated) return null;

  const month = monthOf(today);
  const dueDate = nthDayOfMonth(month, dueDay);
  const firstSaturday = firstSaturdayOfMonth(month);
  const paid = Boolean(state.current.done['pay-amex']);
  const overdue = !paid && dueDate < today;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-1">
        <CreditCard size={16} aria-hidden="true" /> Amex — never carry a balance
      </h2>

      <p className="text-sm text-ink-2">
        Amex charges {AMEX_INTEREST_RATE_PCT}% on a carried balance. Any interest paid there
        outweighs everything this plan earns in savings interest — paying it in full every
        cycle is the whole rule.
      </p>

      {paid ? (
        // No `--positive` token in v3 — paid-in-full needs no colour, the check shape
        // and full-strength ink already say "done" (DESIGN-V3.md §1).
        <div className="flex items-center gap-2 text-sm text-ink-1">
          <CheckCircle2 size={16} aria-hidden="true" /> Paid in full for this cycle.
        </div>
      ) : (
        <div className="rounded-card bg-surface-sunk px-3 py-3">
          <p className={['text-sm font-medium', overdue ? 'text-critical' : 'text-ink-1'].join(' ')}>
            {overdue ? `Statement was due ${formatDate(dueDate, 'long')}` : `Statement due ${formatDate(dueDate, 'long')}`}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Also part of the first-Saturday review ({formatDate(firstSaturday, 'long')}) — export the
            statement, check it against budget, then pay it off here.
          </p>
        </div>
      )}

      <p className="text-xs text-ink-3">
        Tally can see Amex transactions once they're imported, not the card's live balance —
        this is a reminder to pay in full, not a confirmation that it happened.
      </p>

      <Button
        variant={paid ? 'ghost' : 'primary'}
        onClick={() => toggleItem('pay-amex')}
        aria-pressed={paid}
      >
        {paid ? 'Undo — not actually paid yet' : 'Mark paid in full'}
      </Button>

      {editingDueDay ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(draftDueDay);
            if (Number.isFinite(n) && n >= 1 && n <= 28) {
              void updateSettings({ amexDueDayOfMonth: Math.round(n) });
            }
            setEditingDueDay(false);
          }}
        >
          <Input
            label="Due day of month"
            type="number"
            min={1}
            max={28}
            inputMode="numeric"
            value={draftDueDay}
            onChange={(e) => setDraftDueDay(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="ghost" size="md">
            Done
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraftDueDay(String(dueDay));
            setEditingDueDay(true);
          }}
          className="min-h-[48px] self-start text-xs text-ink-3 underline decoration-dotted underline-offset-4"
        >
          Due on the {dueDay}
          {ordinalSuffix(dueDay)} — not always August 11th. Change it
        </button>
      )}
    </Card>
  );
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
