import React from 'react';
import type { SemanticTone } from './types';
import { tokenVar, clampRatio, formatPercent } from './utils';
import { ChartEnter } from './ChartEnter';

export interface ProgressRingProps {
  /** 0–1 typically; values above 1 (over budget) still render a full ring, tone communicates the overage. */
  value: number;
  size?: number;
  thickness?: number;
  tone?: SemanticTone;
  label: string;
  /** Custom centre content, e.g. a money figure + caption. Defaults to a percentage. */
  centerContent?: React.ReactNode;
  className?: string;
}

/** Circular progress meter — month spend vs budget, Safe-to-Spend pacing, etc. */
export function ProgressRing({
  value,
  size = 120,
  thickness = 12,
  tone = 'accent',
  label,
  centerContent,
  className = '',
}: ProgressRingProps) {
  const cx = 50;
  const cy = 50;
  const r = 50 - thickness / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const ratio = clampRatio(value);
  const dashOffset = circumference * (1 - ratio);

  return (
    <ChartEnter className={className}>
      <figure
        role="img"
        aria-label={`${label}: ${formatPercent(value)}${value > 1 ? ' (over)' : ''}`}
        className="relative m-0 inline-flex shrink-0 items-center justify-center"
        style={{ width: size, maxWidth: '100%', aspectRatio: '1 / 1' }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={tokenVar('surface-2')} strokeWidth={thickness} />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={tokenVar(tone)}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          {centerContent ?? <span className="tabular-nums text-lg font-semibold text-ink-1">{formatPercent(value)}</span>}
        </figcaption>
      </figure>
    </ChartEnter>
  );
}
