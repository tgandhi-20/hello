import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/ui';
import { useStore } from '@/store/useStore';
import { computeMonthMoney } from '@/money';
import { Equation } from './Equation';
import {
  LEAD,
  BILLS_DEFINITION,
  SAVINGS_DEFINITION,
  WHAT_IT_SEES,
  WHERE_DATA_LIVES,
  WHY_ENTRIES,
  INCOME_UNSET_MESSAGE,
} from './copy';

/**
 * "How Tally works" (Menu > App > "How Tally works") — DESIGN-V4.md §4.3 and
 * this feature's own brief: half a screen, plain English, the equation shown
 * with the user's OWN live numbers (never a generic illustration), and the
 * single most important honesty statement in the app — what Tally can and
 * cannot see. Prose throughout, not a FAQ accordion.
 *
 * Reads straight from the store and `computeMonthMoney()` (the one money
 * model, DESIGN-V4.md §1) — this screen never computes a number of its own.
 * If Home's equation and this page's equation ever disagreed, one of them
 * would have to go; importing the same function is what makes that
 * structurally impossible.
 */
export function HelpScreen() {
  const navigate = useNavigate();
  const txns = useStore((s) => s.txns);
  const recurring = useStore((s) => s.recurring);
  const categories = useStore((s) => s.categories);
  const settings = useStore((s) => s.settings);

  const money = computeMonthMoney({ txns, recurring, settings, categories });

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-1">{LEAD}</p>

        {money.incomeUnset ? (
          <div className="flex flex-col items-start gap-3 rounded-card bg-surface-sunk p-4">
            <p className="text-sm text-ink-2">{INCOME_UNSET_MESSAGE}</p>
            <Button onClick={() => navigate('/settings')}>Set income in Settings</Button>
          </div>
        ) : (
          <Equation money={money} paydayDayOfMonth={settings.paydayDayOfMonth} />
        )}

        <p className="text-sm text-ink-2">{BILLS_DEFINITION}</p>
        <p className="text-sm text-ink-2">{SAVINGS_DEFINITION}</p>
      </div>

      <div className="rounded-card bg-surface-sunk p-4">
        <p className="text-sm text-ink-1">{WHAT_IT_SEES}</p>
      </div>

      <p className="text-sm text-ink-2">{WHERE_DATA_LIVES}</p>

      <div className="flex flex-col gap-3">
        {WHY_ENTRIES.map((entry) => (
          <p key={entry.q} className="text-sm text-ink-2">
            {entry.a}
          </p>
        ))}
      </div>
    </div>
  );
}
