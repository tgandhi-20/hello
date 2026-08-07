import React from 'react';

export interface ProgressBarProps {
  /** 0–1. Values above 1 are clamped visually but reported via aria as over-limit. */
  value: number;
  /** Colour tone: default accent, or semantic warning/danger for budget-over states. */
  tone?: 'accent' | 'positive' | 'warning' | 'danger';
  className?: string;
  label?: string;
}

// `warning`/`danger` are retained prop names (frozen API) but paint with the v2
// `caution`/`negative` semantic tokens.
const TONE_CLASSES: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  warning: 'bg-caution',
  danger: 'bg-negative',
};

/** Thin horizontal progress meter, e.g. category budget usage. */
export function ProgressBar({ value, tone = 'accent', className = '', label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={['h-2 w-full overflow-hidden rounded-pill bg-surface-2', className].join(' ')}
    >
      <div
        className={['h-full rounded-pill transition-[width] duration-180 ease-standard', TONE_CLASSES[tone]].join(' ')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
