import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { ListGroup, ListRow, formatMoney } from '@/ui';
import type { MonthMoney } from '@/money';

export interface DepositPlanRowProps {
  money: MonthMoney;
}

/**
 * Home's fourth section (DESIGN-V4.md §1/§2) — ONE row, not a card:
 * `$X of $72,339 · on track · N days`. Tapping opens the full goal screen.
 *
 * Reads `money.savingsProgress` — the SAME projection engine
 * (`src/features/goal/projection.ts`) the goal screen uses, run with THIS
 * month's live Savings line as its monthly contribution (see
 * `src/money/index.ts`'s `buildSavingsProgress`) — never a second, possibly
 * drifting number computed here.
 *
 * "On track" reads as the absence of a caution chip, not a second green
 * (DESIGN-V4.md §5 carries forward DESIGN-V3.md §1's "no --positive token") —
 * behind-plan gets the amber `caution` tone; on-track is plain ink.
 */
export function DepositPlanRow({ money }: DepositPlanRowProps) {
  const navigate = useNavigate();
  const { savingsProgress } = money;
  const daysLeft = Math.max(0, savingsProgress.daysUntilTarget);

  return (
    <ListGroup>
      <ListRow
        onClick={() => navigate('/goal')}
        leading={
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
            <Target size={16} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
          </span>
        }
        title="Deposit plan"
        subtitle={
          <>
            <span className="money">{formatMoney(savingsProgress.actualBalanceCents)}</span> of{' '}
            <span className="money">{formatMoney(savingsProgress.goalTargetCents)}</span> ·{' '}
            {savingsProgress.onTrack ? (
              'on track'
            ) : (
              <span className="text-caution">{formatMoney(savingsProgress.behindCents)} behind</span>
            )}{' '}
            · {daysLeft} day{daysLeft === 1 ? '' : 's'}
          </>
        }
        chevron
      />
    </ListGroup>
  );
}
