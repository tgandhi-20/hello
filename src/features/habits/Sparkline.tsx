import React from 'react';

export interface SparklineProps {
  values: number[];
  className?: string;
  /** Token name, e.g. 'accent' or 'positive' — resolved as `var(--{token})`. */
  colorToken?: string;
  height?: number;
}

/**
 * Tiny hand-rolled inline-SVG sparkline (CONTRACTS.md §1: no chart library, ever).
 * Deliberately local to `features/habits` rather than `src/charts` (Agent 5's), since
 * this is a small presentational primitive, not a shared charting system.
 */
export function Sparkline({ values, className = '', colorToken = 'accent', height = 32 }: SparklineProps) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const width = Math.max(values.length * 6, 40);
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={`var(--${colorToken})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
