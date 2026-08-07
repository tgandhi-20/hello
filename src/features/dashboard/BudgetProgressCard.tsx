import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Card, Button, formatMoney } from '@/ui';
import { ProgressRing, safeDiv, clampRatio } from '@/charts';
import type { SemanticTone } from '@/charts';

export interface BudgetProgressCardProps {
  spentCents: number;
  budgetCents: number;
}

function toneFor(ratio: number): SemanticTone {
  if (ratio > 1) return 'danger';
  if (ratio >= 0.8) return 'warning';
  return 'accent';
}

/** Month spend vs total budget, as a progress ring. Calm and factual — over budget is information. */
export function BudgetProgressCard({ spentCents, budgetCents }: BudgetProgressCardProps) {
  const navigate = useNavigate();

  if (budgetCents <= 0) {
    return (
      <Card className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2">
          <Target size={24} strokeWidth={1.75} className="text-text-2" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-md font-semibold text-text-1">No budget set yet</h2>
          <p className="text-sm text-text-2">Set category caps to see spend vs budget here.</p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/budgets')}>
          Set up
        </Button>
      </Card>
    );
  }

  const ratio = safeDiv(spentCents, budgetCents, 0);
  const tone = toneFor(ratio);
  const remaining = budgetCents - spentCents;

  return (
    <Card className="flex items-center gap-4">
      <ProgressRing
        value={clampRatio(ratio)}
        size={88}
        thickness={10}
        tone={tone}
        label="Month spend vs budget"
        centerContent={
          <span className="tabular-nums text-sm font-semibold text-text-1">{Math.round(ratio * 100)}%</span>
        }
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-md font-semibold text-text-1">Month spend vs budget</h2>
        <p className="tabular-nums text-sm text-text-2">
          {formatMoney(spentCents)} of {formatMoney(budgetCents)}
        </p>
        <p className="text-sm text-text-2">
          {remaining >= 0
            ? `${formatMoney(remaining)} left this month`
            : `${formatMoney(Math.abs(remaining))} over — still tracking, no drama`}
        </p>
      </div>
    </Card>
  );
}
