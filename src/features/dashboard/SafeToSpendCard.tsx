import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Card, Button, formatMoney } from '@/ui';
import type { SafeToSpendResult } from './safeToSpend';
import { monthLabel } from '../insights/monthMath';

export interface SafeToSpendCardProps {
  result: SafeToSpendResult;
}

/**
 * The dashboard's hero number. Never invents an income figure — if
 * `settings.monthlyIncomeCents` is unset this renders a prompt instead of a number.
 */
export function SafeToSpendCard({ result }: SafeToSpendCardProps) {
  const navigate = useNavigate();

  if (result.incomeUnset) {
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-tint-12)]">
          <Wallet size={26} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-md font-semibold text-text-1">Set your income to see Safe to Spend</h2>
          <p className="mt-1 text-sm text-text-2">
            Add your expected monthly income in Settings and Tally will work out how much you can safely
            spend each day for the rest of {monthLabel(result.month)}.
          </p>
        </div>
        <Button onClick={() => navigate('/settings')}>Set income in Settings</Button>
      </Card>
    );
  }

  const over = result.perDayCents < 0;

  return (
    <Card className="flex flex-col gap-2">
      <span className="text-sm text-text-2">Safe to spend / day</span>
      <span
        className={['tabular-nums text-2xl font-semibold', over ? 'text-danger' : 'text-text-1'].join(' ')}
      >
        {formatMoney(result.perDayCents)}
      </span>
      <p className="text-sm text-text-2">
        {formatMoney(result.incomeCents)} income − {formatMoney(result.committedCents)} bills −{' '}
        {formatMoney(result.savingsTargetCents)} savings − {formatMoney(result.spentSoFarCents)} spent so
        far, split across {result.daysRemaining} day{result.daysRemaining === 1 ? '' : 's'} left in{' '}
        {monthLabel(result.month)}.
      </p>
      {over ? (
        <p className="text-sm text-danger">
          That's a negative number — bills, savings and what's already gone add up to more than this
          month's income. Not a scold, just the maths.
        </p>
      ) : null}
    </Card>
  );
}
