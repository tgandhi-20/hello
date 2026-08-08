import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { ListGroup, ListRow, formatMoney, todayStr } from '@/ui';
import {
  balanceAtDate,
  buildGoalProjection,
  daysUntil,
  useCurrentSavingsBalance,
} from '@/features/goal';

/**
 * Today's fourth section (DESIGN-V3.md §4.4) — ONE row, not a card:
 * `$X of $72,339 · on track · N days`. Tapping navigates to Plan's goal
 * section. Reuses the goal feature's own projection/current-balance logic
 * (`buildGoalProjection`, `balanceAtDate`, `useCurrentSavingsBalance`)
 * rather than re-deriving the on-track comparison — same numbers the Plan
 * tab's full Goal screen shows, never a second, possibly-drifting copy.
 *
 * "On track" reads as the absence of a caution chip, not a second green
 * (DESIGN-V3.md §1 has no `--positive` token) — behind-plan gets the amber
 * `caution` tone; on-track is plain ink.
 */
export function GoalRow() {
  const navigate = useNavigate();
  const projection = useMemo(() => buildGoalProjection(), []);
  const today = todayStr();

  const plannedTodayCents = useMemo(
    () => balanceAtDate(projection.input, projection.points, today),
    [projection, today]
  );
  const [balanceState] = useCurrentSavingsBalance(plannedTodayCents);

  const daysLeft = Math.max(0, daysUntil(projection.targetDate));
  const behindCents = plannedTodayCents - balanceState.balanceCents;
  const onTrack = behindCents <= 0;

  return (
    <ListGroup>
      <ListRow
        onClick={() => navigate('/plan/goal')}
        leading={
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
            <Target size={16} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
          </span>
        }
        title="Deposit goal"
        subtitle={
          <>
            <span className="money">{formatMoney(balanceState.balanceCents)}</span> of{' '}
            <span className="money">{formatMoney(projection.targetCents)}</span> ·{' '}
            {onTrack ? (
              'on track'
            ) : (
              <span className="text-caution">{formatMoney(behindCents)} behind</span>
            )}{' '}
            · {daysLeft} day{daysLeft === 1 ? '' : 's'}
          </>
        }
        chevron
      />
    </ListGroup>
  );
}
