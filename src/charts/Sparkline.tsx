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
  /** Legend label for the primary series. Only shown when `compareData` is present. */
  seriesLabel?: string;
  /** Legend label for the muted comparison series. */
  compareLabel?: string;
}

const VB_W = 100;
const VB_H = 24;
/** Vertical breathing room inside the viewBox so a min/max point never touches the
 * top/bottom edge and gets visually clipped by its own box. */
const PAD_Y = 4;
const PLOT_H = VB_H - PAD_Y * 2;

function buildPoints(values: number[], min: number, span: number): string {
  const n = values.length;
  if (n === 0) return '';
  if (n === 1) {
    const y = PAD_Y + (PLOT_H - safeDiv(values[0] - min, span, 0.5) * PLOT_H);
    return `0,${y} ${VB_W},${y}`;
  }
  return values
    .map((v, i) => {
      const x = safeDiv(i, n - 1, 0) * VB_W;
      const y = PAD_Y + (PLOT_H - safeDiv(v - min, span, 0.5) * PLOT_H);
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
  seriesLabel = 'This month',
  compareLabel = 'Last month',
}: SparklineProps) {
  const { min, span, hasSignal } = useMemo(() => {
    const all = [...data, ...(compareData ?? [])].filter((v) => Number.isFinite(v));
    if (all.length === 0) return { min: 0, span: 1, hasSignal: false };
    const lo = Math.min(...all, 0);
    const hi = Math.max(...all, 0);
    return { min: lo, span: hi - lo === 0 ? 1 : hi - lo, hasSignal: hi - lo !== 0 || all.some((v) => v !== 0) };
  }, [data, compareData]);

  const isEmpty = data.length === 0;
  const hasCompare = Boolean(compareData && compareData.length > 0);

  return (
    <ChartEnter className={className}>
      <div className="flex flex-col gap-1.5">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label={isEmpty || !hasSignal ? `${ariaLabel} No data yet.` : ariaLabel}
        >
          {isEmpty ? (
            <line
              x1={0}
              y1={VB_H / 2}
              x2={VB_W}
              y2={VB_H / 2}
              stroke={tokenVar('border')}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : (
            <>
              {hasCompare ? (
                <polyline
                  points={buildPoints(compareData as number[], min, span)}
                  fill="none"
                  stroke={tokenVar('text-3')}
                  strokeWidth={1.25}
                  strokeOpacity={0.6}
                  strokeDasharray="3 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <polyline
                points={buildPoints(data, min, span)}
                fill="none"
                stroke={tokenVar(colorToken)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        {hasCompare && !isEmpty ? (
          <div className="flex items-center gap-3 text-[11px] text-text-2" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-[3px] w-3 shrink-0 rounded-pill"
                style={{ backgroundColor: tokenVar(colorToken) }}
              />
              {seriesLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-3">
              <span
                className="inline-block h-[2px] w-3 shrink-0 rounded-pill opacity-70"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${tokenVar('text-3')} 0 3px, transparent 3px 5px)`,
                }}
              />
              {compareLabel}
            </span>
          </div>
        ) : null}
      </div>
    </ChartEnter>
  );
}
