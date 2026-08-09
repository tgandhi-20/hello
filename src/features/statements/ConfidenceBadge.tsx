import React from 'react';
import type { ConfidenceLevel } from './cycle';

// DESIGN-V4.md §3: "Statement cycle / confidence -> Card balances — say 'we think',
// 'not sure yet', never 'confidence: low'."
const LABEL: Record<ConfidenceLevel, string> = {
  high: "We're confident",
  medium: 'We think so',
  low: 'Not sure yet',
  unknown: "Don't know yet",
};

// No `--positive` token in v3 (DESIGN-V3.md §1) — a confident prediction reads as the
// absence of warning (full-strength ink), not a second green. The ramp still runs
// ink-1 -> ink-2 -> caution -> critical as confidence drops.
const TONE_CLASS: Record<ConfidenceLevel, string> = {
  high: 'text-ink-1',
  medium: 'text-ink-2',
  low: 'text-caution',
  unknown: 'text-critical',
};

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  /** Optional short prefix, e.g. "You set this" for a user override. */
  sourceLabel?: string;
  className?: string;
}

/** A small, honest confidence pill — never lets an inferred date read as certain. */
export function ConfidenceBadge({ level, sourceLabel, className = '' }: ConfidenceBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-0.5 text-2xs',
        TONE_CLASS[level],
        className,
      ].join(' ')}
    >
      {sourceLabel ? `${sourceLabel} · ` : ''}
      {LABEL[level]}
    </span>
  );
}
