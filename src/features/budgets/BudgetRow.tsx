import React, { useState } from 'react';
import type { Category } from '@/types';
import { CategoryIcon, ProgressBar, formatMoney } from '@/ui';
import type { ProgressBarProps } from '@/ui';
import { safeDiv, clampRatio } from '@/charts';
import { parseDollarsToCents } from '@/features/settings/money';

export interface BudgetRowProps {
  category: Category;
  limitCents: number;
  spentCents: number;
  daysRemaining: number;
  onSave: (limitCents: number) => void | Promise<void>;
}

// `ProgressBar`'s `warning`/`danger` prop names are its own frozen API (see its doc
// comment) — it paints them with the v2 `--caution`/`--negative` tokens internally,
// so this function targets that prop's naming, not `@/charts`' `SemanticTone`.
function toneFor(ratio: number): NonNullable<ProgressBarProps['tone']> {
  if (ratio > 1) return 'danger';
  if (ratio >= 0.8) return 'warning';
  // Under 80% of cap is budget state ("under budget"), not an interactive control — `--positive`
  // is the token DESIGN.md §2 reserves for exactly this, not `--accent`.
  return 'positive';
}

/** One category's monthly cap: progress bar, remaining-per-day, tap-to-edit limit. Never shaming — over
 * budget renders in `--negative` colour but with plain, factual copy, per CONTRACTS.md §4's tone law. */
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
    // CONTRACTS.md §3: money parsing is integer string-math, never parseFloat/toFixed.
    const parsed = parseDollarsToCents(draft);
    const cents = parsed !== null && parsed > 0 ? parsed : 0;
    setEditing(false);
    if (cents !== limitCents) onSave(cents);
  };

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={category.icon} colorToken={category.colorToken} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-1">{category.label}</p>
          {hasLimit ? (
            <p className="text-xs text-ink-2">
              <span className="money">{formatMoney(spentCents)}</span> of{' '}
              <span className="money">{formatMoney(limitCents)}</span>
            </p>
          ) : (
            <p className="text-xs text-ink-3">No cap set</p>
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
            className="h-12 w-24 shrink-0 rounded-control border border-hairline bg-surface-2 px-3 text-right text-sm text-ink-1 outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[48px] shrink-0 rounded-pill bg-surface-2 px-3 text-sm font-medium text-accent active:bg-accent-tint"
          >
            {hasLimit ? 'Edit' : 'Set cap'}
          </button>
        )}
      </div>

      {hasLimit ? (
        <>
          <ProgressBar value={ratio} tone={tone} label={`${category.label} budget usage`} />
          <p className="text-xs text-ink-2">
            {remainingCents >= 0 ? (
              <>
                <span className="money text-ink-2">{formatMoney(Math.max(0, Math.round(remainingPerDay)))}</span>
                /day left
              </>
            ) : (
              <>
                <span className="money text-negative">{formatMoney(Math.abs(remainingCents))}</span> over this
                cap
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
