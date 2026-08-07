import React, { useMemo } from 'react';
import { tokenVar, safeDiv } from './utils';
import { ChartEnter } from './ChartEnter';

export interface SparklineProps {
  /** Values in time order, e.g. daily running spend this month. */
  data: number[];
  /** Optional second series drawn dashed and muted, e.g. last month for comparison. */
  compareData?: number[];
  height?: number;
  colorToken?: string;
  ariaLabel: string;
  className?: string;
}

const VB_W = 100;

function buildPoints(values: number[], min: number, span: number): string {
  const n = values.length;
  if (n === 0) return '';
  if (n === 1) {
    const y = 20 - safeDiv(values[0] - min, span, 0.5) * 20;
    return `0,${y} ${VB_W},${y}`;
  }
  return values
    .map((v, i) => {
      const x = safeDiv(i, n - 1, 0) * VB_W;
      const y = 20 - safeDiv(v - min, span, 0.5) * 20;
      return `${x},${y}`;
    })
    .join(' ');
}

/** Compact trend line — daily spend this month, optionally overlaid against last month. */
export function Sparkline({
  data,
  compareData,
  height = 40,
  colorToken = 'accent',
  ariaLabel,
  className = '',
}: SparklineProps) {
  const { min, span, hasSignal } = useMemo(() => {
    const all = [...data, ...(compareData ?? [])].filter((v) => Number.isFinite(v));
    if (all.length === 0) return { min: 0, span: 1, hasSignal: false };
    const lo = Math.min(...all, 0);
    const hi = Math.max(...all, 0);
    return { min: lo, span: hi - lo === 0 ? 1 : hi - lo, hasSignal: hi - lo !== 0 || all.some((v) => v !== 0) };
  }, [data, compareData]);

  const isEmpty = data.length === 0;

  return (
    <ChartEnter className={className}>
      <svg
        viewBox={`0 0 ${VB_W} 20`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={isEmpty || !hasSignal ? `${ariaLabel} No data yet.` : ariaLabel}
      >
        {isEmpty ? (
          <line
            x1={0}
            y1={10}
            x2={VB_W}
            y2={10}
            stroke={tokenVar('border')}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : (
          <>
            {compareData && compareData.length > 0 ? (
              <polyline
                points={buildPoints(compareData, min, span)}
                fill="none"
                stroke={tokenVar('text-3')}
                strokeWidth={1.25}
                strokeDasharray="3 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            <polyline
              points={buildPoints(data, min, span)}
              fill="none"
              stroke={tokenVar(colorToken)}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </ChartEnter>
  );
}
