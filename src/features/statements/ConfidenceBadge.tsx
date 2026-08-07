import React from 'react';
import type { ConfidenceLevel } from './cycle';

const LABEL: Record<ConfidenceLevel, string> = {
  high: 'Confident',
  medium: 'Estimated',
  low: 'Rough guess',
  unknown: 'Unknown',
};

const TONE_CLASS: Record<ConfidenceLevel, string> = {
  high: 'text-positive',
  medium: 'text-ink-2',
  low: 'text-caution',
  unknown: 'text-negative',
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
