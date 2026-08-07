import React, { useMemo } from 'react';
import type { ChartDatum } from './types';
import { tokenVar, safeDiv, sumNonNegative, formatPercent } from './utils';
import { ChartEnter } from './ChartEnter';

export interface ReferenceMark {
  /** 0–1 position along the bar. */
  at: number;
  label: string;
}

export interface StackedBarProps {
  /** e.g. needs / wants / savings totals for the month. */
  segments: ChartDatum[];
  /** Guideline ticks, e.g. the 50/30/20 rule at 0.5 and 0.8. */
  referenceMarks?: ReferenceMark[];
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
}

const VB_W = 100;

/** Single horizontal stacked bar — e.g. needs/wants/savings split against a 50/30/20 reference. */
export function StackedBar({
  segments,
  referenceMarks = [],
  formatValue = (v) => String(v),
  height = 28,
  className = '',
}: StackedBarProps) {
  const total = sumNonNegative(segments.map((s) => s.value));
  const isEmpty = total <= 0;

  const rects = useMemo(() => {
    if (isEmpty) return [];
    let cursor = 0;
    return segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const w = safeDiv(s.value, total, 0) * VB_W;
        const x = cursor;
        cursor += w;
        return { s, x, w };
      });
  }, [segments, isEmpty, total]);

  const ariaLabel = isEmpty
    ? 'Spending split: no spending recorded yet.'
    : `Spending split: ${rects.map(({ s }) => `${s.label} ${formatPercent(safeDiv(s.value, total, 0))}`).join(', ')}.`;

  return (
    <ChartEnter className={className}>
      <div>
        <svg viewBox={`0 0 ${VB_W} 8`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
          <rect x={0} y={0} width={VB_W} height={8} rx={4} fill={tokenVar('surface-2')} />
          {isEmpty ? null : (
            <clipPath id="stacked-bar-clip">
              <rect x={0} y={0} width={VB_W} height={8} rx={4} />
            </clipPath>
          )}
          <g clipPath={isEmpty ? undefined : 'url(#stacked-bar-clip)'}>
            {rects.map(({ s, x, w }) => (
              <rect key={s.id} x={x} y={0} width={w} height={8} fill={tokenVar(s.colorToken, 'accent')} />
            ))}
          </g>
          {referenceMarks.map((m) => (
            <line
              key={m.label}
              x1={m.at * VB_W}
              y1={-1}
              x2={m.at * VB_W}
              y2={9}
              stroke={tokenVar('text-1')}
              strokeWidth={0.6}
              strokeDasharray="1.2 1.2"
              opacity={0.6}
            />
          ))}
        </svg>
        {referenceMarks.length > 0 ? (
          <div className="relative mt-1 h-4 text-[10px] text-text-3" aria-hidden="true">
            {referenceMarks.map((m) => (
              <span key={m.label} className="absolute -translate-x-1/2" style={{ left: `${m.at * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        ) : null}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 text-xs text-text-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tokenVar(s.colorToken, 'accent') }}
                aria-hidden="true"
              />
              <span>{s.label}</span>
              <span className="tabular-nums text-text-1">{formatValue(s.value)}</span>
              <span className="text-text-3">({formatPercent(safeDiv(s.value, total, 0))})</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartEnter>
  );
}
