import React, { useMemo } from 'react';
import type { Cents } from '@/types';
import { formatMoney } from '@/ui';
import { tokenVar, safeDiv, clampRatio, ChartEnter } from '@/charts';
import type { MonthlyProjectionPoint } from './projection';

export interface GoalProjectionChartProps {
  points: readonly MonthlyProjectionPoint[];
  targetCents: Cents;
  height?: number;
  ariaLabel?: string;
  className?: string;
  /** Show the small legend row below the chart. Off by default in the compact dashboard
   *  card, on in the full goal screen. */
  showLegend?: boolean;
}

const VB_W = 100;
const VB_H = 56;
const PAD_X = 2;
const PAD_TOP = 6;
const PAD_BOTTOM = 8;
const PLOT_W = VB_W - PAD_X * 2;
const PLOT_H = VB_H - PAD_TOP - PAD_BOTTOM;

/**
 * Compact projection line: the account balance from the plan's baseline through to
 * the target date, with the two planned one-off withdrawals marked as real dips — not
 * smoothed away — and a dashed target reference line. Hand-rolled SVG (no chart lib,
 * CONTRACTS.md §1), built on the shared chart kit's token/scale helpers.
 */
export function GoalProjectionChart({
  points,
  targetCents,
  height = 140,
  ariaLabel,
  className = '',
  showLegend = false,
}: GoalProjectionChartProps) {
  const { series, min, max, oneOffMarkers, hasData } = useMemo(() => {
    if (points.length === 0) {
      return { series: [] as Cents[], min: 0, max: 1, oneOffMarkers: [] as { index: number; label: string }[], hasData: false };
    }
    // series[0] is the balance the projection started from (the first point's opening
    // balance); every point after that is a month's closing balance. This makes the
    // line begin at the plan's own baseline rather than jumping in one month later.
    const series: Cents[] = [points[0].openingBalanceCents, ...points.map((p) => p.closingBalanceCents)];
    const allValues = [...series, targetCents];
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues);
    const oneOffMarkers = points
      .map((p, i) => (p.oneOffCents < 0 ? { index: i + 1, label: p.oneOffLabels.join(', ') } : null))
      .filter((m): m is { index: number; label: string } => m !== null);
    return { series, min: rawMin, max: rawMax === rawMin ? rawMax + 1 : rawMax, oneOffMarkers, hasData: true };
  }, [points, targetCents]);

  const span = max - min === 0 ? 1 : max - min;
  const xFor = (i: number) => PAD_X + safeDiv(i, Math.max(series.length - 1, 1), 0) * PLOT_W;
  const yFor = (v: number) => PAD_TOP + (1 - clampRatio(safeDiv(v - min, span, 0.5))) * PLOT_H;

  const linePoints = series.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
  const targetY = yFor(targetCents);

  const computedAriaLabel =
    ariaLabel ??
    (hasData
      ? `Projected deposit balance, from ${formatMoney(series[0])} to ${formatMoney(
          series[series.length - 1]
        )}, against a ${formatMoney(targetCents)} target. ${
          oneOffMarkers.length > 0 ? `Includes ${oneOffMarkers.length} planned one-off withdrawal(s).` : ''
        }`
      : 'Deposit projection: no data yet.');

  return (
    <ChartEnter className={className}>
      <div className="flex flex-col gap-1.5">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label={computedAriaLabel}
        >
          {hasData ? (
            <>
              <line
                x1={PAD_X}
                y1={targetY}
                x2={VB_W - PAD_X}
                y2={targetY}
                stroke={tokenVar('positive')}
                strokeWidth={0.6}
                strokeDasharray="2 1.5"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={linePoints}
                fill="none"
                stroke={tokenVar('accent')}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {oneOffMarkers.map((m) => (
                <circle
                  key={m.index}
                  cx={xFor(m.index)}
                  cy={yFor(series[m.index])}
                  r={1.8}
                  fill={tokenVar('warning')}
                  stroke={tokenVar('bg')}
                  strokeWidth={0.5}
                />
              ))}
            </>
          ) : (
            <line
              x1={PAD_X}
              y1={VB_H / 2}
              x2={VB_W - PAD_X}
              y2={VB_H / 2}
              stroke={tokenVar('border')}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
        </svg>
        {showLegend && hasData ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-2" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3 shrink-0 rounded-pill bg-accent" />
              Projected balance
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-[2px] w-3 shrink-0 rounded-pill opacity-80"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${tokenVar('positive')} 0 2px, transparent 2px 3.5px)`,
                }}
              />
              Target
            </span>
            {oneOffMarkers.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-warning" />
                Planned one-off
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </ChartEnter>
  );
}
