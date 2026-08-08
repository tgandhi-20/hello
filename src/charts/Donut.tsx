import React, { useMemo } from 'react';
import type { ChartDatum } from './types';
import { tokenVar, sumNonNegative, safeDiv, describeArc, formatPercent, allocateArcSweeps, clamp } from './utils';
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

/** Gap rendered between adjacent ring segments, in viewBox degrees. */
const GAP_DEG = 3;
/**
 * Every segment gets at least this many degrees of visible arc, however small its real
 * share is — a 1% category should still read as a thin sliver, not vanish into a dot.
 * Combined with `strokeLinecap: butt` (no rounded overtravel past the arc's own
 * endpoints) this is what keeps tiny segments from bunching into overlapping blobs.
 */
const MIN_SWEEP_DEG = 8;

/**
 * Category-breakdown donut ring with a centre label. Hollow centre carries the
 * headline number so the chart is never "just a shape" — the number is always there
 * even if a viewer can't parse relative arc lengths.
 */
export function Donut({
  data,
  size = 160,
  thickness = 14,
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
    const n = cleaned.length;
    // With only one segment there's nothing to gap against — let it run the full ring.
    const gap = n > 1 ? Math.min(GAP_DEG, 360 / n / 3) : 0;
    const available = 360 - gap * n;
    const fractions = cleaned.map((d) => safeDiv(d.value, total, 0));
    const sweeps = allocateArcSweeps(fractions, available, MIN_SWEEP_DEG);
    let cursor = 0;
    return cleaned.map((d, i) => {
      const sweep = sweeps[i];
      const start = cursor + gap / 2;
      const end = start + sweep;
      cursor += sweep + gap;
      return { d, fraction: fractions[i], path: describeArc(cx, cy, r, start, end) };
    });
  }, [cleaned, isEmpty, r, total]);

  // The centre hole has to hold two lines of text without touching the ring. Scale both
  // font sizes off the hole's actual pixel diameter (a function of `size`, since the SVG
  // viewBox is a fixed 0-100 box that scales proportionally with it) rather than a fixed
  // Tailwind size — a 120px donut and a 200px donut need very differently sized labels.
  const holeDiameterPx = useMemo(() => {
    const holeRadius = Math.max(r - thickness / 2, 0);
    return (holeRadius * 2 * size) / 100;
  }, [r, thickness, size]);
  const valueFontPx = clamp(holeDiameterPx * 0.15, 11, 18);
  const labelFontPx = clamp(holeDiameterPx * 0.09, 9, 12);
  const captionMaxWidthPx = Math.max(holeDiameterPx * 0.9, 32);

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
            stroke={tokenVar('surface-sunk')}
            strokeWidth={thickness}
          />
          {segments.map((s) => (
            <path
              key={s.d.id}
              d={s.path}
              fill="none"
              stroke={tokenVar(s.d.colorToken, 'accent')}
              strokeWidth={thickness}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          {centerLabel ? (
            <span
              className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-ink-2"
              style={{ fontSize: labelFontPx, maxWidth: captionMaxWidthPx, lineHeight: 1.2 }}
            >
              {centerLabel}
            </span>
          ) : null}
          <span
            className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-semibold tabular-nums text-ink-1"
            style={{ fontSize: valueFontPx, maxWidth: captionMaxWidthPx, lineHeight: 1.2 }}
          >
            {centerValue ?? formatValue(total)}
          </span>
        </figcaption>
      </figure>
    </ChartEnter>
  );
}
