import React, { useMemo } from 'react';
import { Repeat, AlertTriangle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, formatMoney } from '@/ui';
import {
  KNOWN_SUBSCRIPTIONS,
  KNOWN_SUBSCRIPTIONS_TOTAL_CENTS,
  CANCELLED_SUBSCRIPTIONS,
  MISLEADING_PRIOR_SUBSCRIPTIONS_FIGURE_CENTS,
} from '@/personal/plan';
import { detectUnknownSubscriptions } from './subscriptions';

/**
 * Subscription truth list — PERSONAL.md §5 / deliverable 4. The four real
 * subscriptions are shown as known truth, not re-derived from transactions every
 * month. Below them: anything the recurring radar has found that ISN'T on this list —
 * the thing actually worth the user's attention, since the known four never need
 * re-confirming.
 */
export function SubscriptionTruth(): React.JSX.Element | null {
  const hydrated = useStore((s) => s.hydrated);
  const recurring = useStore((s) => s.recurring);

  const unknown = useMemo(() => detectUnknownSubscriptions(recurring), [recurring]);

  if (!hydrated) return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-md font-semibold text-text-1">
        <Repeat size={16} aria-hidden="true" /> Subscriptions
      </h2>

      <ul className="flex flex-col divide-y divide-border">
        {KNOWN_SUBSCRIPTIONS.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
            <span className="text-sm text-text-1">
              {s.merchant}
              {s.id === 'netflix' ? <span className="text-text-3"> (your half, split)</span> : null}
            </span>
            <span className="tabular-nums text-sm font-medium text-text-1">{formatMoney(s.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-semibold text-text-1">Known total</span>
        <span className="tabular-nums text-sm font-semibold text-text-1">
          {formatMoney(KNOWN_SUBSCRIPTIONS_TOTAL_CENTS)}
        </span>
      </div>

      <p className="text-xs text-text-3">Cancelled, not billed: {CANCELLED_SUBSCRIPTIONS.join(', ')}.</p>
      <p className="text-xs text-text-3">
        An earlier estimate put subscriptions at {formatMoney(MISLEADING_PRIOR_SUBSCRIPTIONS_FIGURE_CENTS)}/month.
        That was almost entirely two one-off charges, not a recurring cost — the real number is the total above.
      </p>

      {unknown.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-warning bg-[var(--accent-tint-12)] px-3 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <AlertTriangle size={14} aria-hidden="true" /> Not on the known list
          </p>
          <ul className="flex flex-col gap-1.5">
            {unknown.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm text-text-1">
                <span className="truncate">{s.merchant}</span>
                <span className="tabular-nums shrink-0 font-medium">
                  {formatMoney(s.amountCents)}/{s.cadence.replace('ly', '')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-3">
            Tally saw {unknown.length === 1 ? 'this' : 'these'} charge{unknown.length === 1 ? '' : 's'} repeat at a
            regular interval — worth a look before it becomes a permanent line.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
