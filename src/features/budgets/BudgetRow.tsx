import React, { useState } from 'react';
import type { Category } from '@/types';
import { CategoryIcon, ProgressBar, formatMoney } from '@/ui';
import { safeDiv, clampRatio } from '@/charts';
import type { SemanticTone } from '@/charts';

export interface BudgetRowProps {
  category: Category;
  limitCents: number;
  spentCents: number;
  daysRemaining: number;
  onSave: (limitCents: number) => void | Promise<void>;
}

function toneFor(ratio: number): SemanticTone {
  if (ratio > 1) return 'danger';
  if (ratio >= 0.8) return 'warning';
  return 'accent';
}

/** One category's monthly cap: progress bar, remaining-per-day, tap-to-edit limit. Never shaming — over
 * budget renders in `--danger` colour but with plain, factual copy, per CONTRACTS.md §4's tone law. */
export function BudgetRow({ category, limitCents, spentCents, daysRemaining, onSave }: BudgetRowProps) {
  const [editing, setEditing] = useState(false);
  // Seeding a plain `<input type="number">` needs a bare "12.34" — not `formatMoney`'s
  // "$12.34" — so `toFixed(2)` here is building an editable value, not display text.
  // formatMoney is still the only thing that ever renders money for reading.
  const [draft, setDraft] = useState(() => (limitCents > 0 ? (limitCents / 100).toFixed(2) : ''));

  const hasLimit = limitCents > 0;
  const ratio = clampRatio(safeDiv(spentCents, limitCents, 0));
  const tone = toneFor(safeDiv(spentCents, limitCents, 0));
  const remainingCents = limitCents - spentCents;
  const remainingPerDay = safeDiv(remainingCents, daysRemaining, 0);

  const commit = () => {
    const dollars = parseFloat(draft);
    const cents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
    setEditing(false);
    if (cents !== limitCents) onSave(cents);
  };

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={category.icon} colorToken={category.colorToken} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text-1">{category.label}</p>
          {hasLimit ? (
            <p className="tabular-nums text-xs text-text-2">
              {formatMoney(spentCents)} of {formatMoney(limitCents)}
            </p>
          ) : (
            <p className="text-xs text-text-3">No cap set</p>
          )}
        </div>
        {editing ? (
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            aria-label={`Monthly cap for ${category.label}`}
            className="h-12 w-24 shrink-0 rounded-2xl border border-border bg-surface-2 px-3 text-right text-sm text-text-1 outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[48px] shrink-0 rounded-2xl border border-border px-3 text-sm font-medium text-accent active:bg-surface-2"
          >
            {hasLimit ? 'Edit' : 'Set cap'}
          </button>
        )}
      </div>

      {hasLimit ? (
        <>
          <ProgressBar value={ratio} tone={tone} label={`${category.label} budget usage`} />
          <p className="text-xs text-text-2">
            {remainingCents >= 0
              ? `${formatMoney(Math.max(0, Math.round(remainingPerDay)))}/day left`
              : `${formatMoney(Math.abs(remainingCents))} over this cap`}
          </p>
        </>
      ) : null}
    </div>
  );
}
