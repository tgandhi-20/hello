import React, { useMemo } from 'react';
import type { ChartDatum } from './types';
import { tokenVar, sumNonNegative, safeDiv, describeArc, formatPercent } from './utils';
import { ChartEnter } from './ChartEnter';

export interface DonutProps {
  data: ChartDatum[];
  /** Renders at this square size by default but always scales to its container width. */
  size?: number;
  thickness?: number;
  /** Small caption above the centre value, e.g. "This month". */
  centerLabel?: string;
  /** Big centre value, e.g. formatted total spend. Defaults to a computed total. */
  centerValue?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

const GAP_DEG = 2.5;

/**
 * Category-breakdown donut ring with a centre label. Hollow centre carries the
 * headline number so the chart is never "just a shape" — the number is always there
 * even if a viewer can't parse relative arc lengths.
 */
export function Donut({
  data,
  size = 160,
  thickness = 20,
  centerLabel,
  centerValue,
  formatValue = (v) => String(v),
  className = '',
}: DonutProps) {
  const cx = 50;
  const cy = 50;
  const r = 50 - thickness / 2 - 2;

  const cleaned = useMemo(
    () => data.filter((d) => Number.isFinite(d.value) && d.value > 0).sort((a, b) => b.value - a.value),
    [data]
  );
  const total = sumNonNegative(cleaned.map((d) => d.value));
  const isEmpty = total <= 0;

  const segments = useMemo(() => {
    if (isEmpty) return [];
    let cursor = 0;
    return cleaned.map((d) => {
      const fraction = safeDiv(d.value, total, 0);
      const sweep = fraction * 360;
      const start = cursor + (sweep > GAP_DEG ? GAP_DEG / 2 : 0);
      const end = cursor + Math.max(sweep - (sweep > GAP_DEG ? GAP_DEG / 2 : 0), 0.001);
      cursor += sweep;
      return { d, fraction, path: describeArc(cx, cy, r, start, end) };
    });
  }, [cleaned, isEmpty, r, total]);

  const ariaLabel = isEmpty
    ? 'Category breakdown: no spending recorded yet.'
    : `Category breakdown: ${segments
        .slice(0, 5)
        .map((s) => `${s.d.label} ${formatPercent(s.fraction)}`)
        .join(', ')}${segments.length > 5 ? `, and ${segments.length - 5} more` : ''}.`;

  return (
    <ChartEnter className={className}>
      <figure
        role="img"
        aria-label={ariaLabel}
        className="relative m-0 inline-flex items-center justify-center"
        style={{ width: '100%', maxWidth: size, aspectRatio: '1 / 1' }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={tokenVar('surface-2')}
            strokeWidth={thickness}
          />
          {segments.map((s) => (
            <path
              key={s.d.id}
              d={s.path}
              fill="none"
              stroke={tokenVar(s.d.colorToken, 'accent')}
              strokeWidth={thickness}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          {centerLabel ? <span className="text-xs text-text-2">{centerLabel}</span> : null}
          <span className="tabular-nums text-lg font-semibold text-text-1">
            {centerValue ?? formatValue(total)}
          </span>
        </figcaption>
      </figure>
    </ChartEnter>
  );
}
