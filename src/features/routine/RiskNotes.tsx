import React from 'react';
import { Info } from 'lucide-react';
import { Card, formatMoney } from '@/ui';
import {
  ROOM_VACANCY_MONTHLY_COST_CENTS,
  FOOD_GROUP_WEEKLY_TARGET_CENTS,
  CURRENT_FOOD_SPEND_WEEKLY_CENTS_APPROX,
  SALARY_RAISE_SCENARIO,
} from '@/personal/plan';
import { ROOM_VACANCY_WEEKLY_LIABILITY_CENTS, SQUEEZE_MONTHLY_CENTS } from './planExtras';

interface RiskNote {
  title: string;
  body: string;
}

const RISK_NOTES: RiskNote[] = [
  {
    title: 'Room 2 vacancy',
    body:
      `You're liable for the full ${formatMoney(ROOM_VACANCY_WEEKLY_LIABILITY_CENTS)}/wk rent regardless of ` +
      `whether Room 2 is let. An empty room costs ${formatMoney(ROOM_VACANCY_MONTHLY_COST_CENTS)}/month and ` +
      'nearly wipes out the savings rate. No separate reserve is needed for this — saving simply pauses ' +
      'while the room is empty. Worth re-advertising early rather than waiting for the sitting tenant to leave.',
  },
  {
    title: 'Food is the biggest behavioural change',
    body:
      `The plan targets ${formatMoney(FOOD_GROUP_WEEKLY_TARGET_CENTS)}/wk on food; recent actual spend has run ` +
      `closer to ${formatMoney(CURRENT_FOOD_SPEND_WEEKLY_CENTS_APPROX)}/wk. Closing that gap is the single ` +
      'biggest behavioural change in the plan — the food screens track it weekly, which is the number that ' +
      'matters here, not this note.',
  },
  {
    title: 'Salary is the highest-leverage variable',
    body:
      `Subscriptions, coffee and phone squeezed together total roughly ${formatMoney(SQUEEZE_MONTHLY_CENTS)}/month. ` +
      `A $10k raise is worth +${formatMoney(SALARY_RAISE_SCENARIO.monthlyImpactCents)}/month with no habit change ` +
      'at all — income moves the plan more than any amount of belt-tightening on the small stuff.',
  },
];

/**
 * Risk notes — PERSONAL.md §9 / deliverable 5. Stated ONCE, calmly, on a screen the
 * user chooses to visit. This is deliberately a static page section, not a toast, badge,
 * or anything that fires on its own — CONTRACTS.md §4's "never shames, never nags" rule
 * applies as much to a true statement repeated too often as to a moralising one. Numbers
 * here are read-only context, not something to tick off.
 */
export function RiskNotes(): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="flex items-center gap-1.5 text-md font-semibold text-text-1">
        <Info size={16} aria-hidden="true" /> Worth knowing
      </h2>
      {RISK_NOTES.map((note) => (
        <div key={note.title} className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-1">{note.title}</p>
          <p className="text-sm text-text-2">{note.body}</p>
        </div>
      ))}
    </Card>
  );
}
