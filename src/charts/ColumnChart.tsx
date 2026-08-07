import React, { useMemo } from 'react';
import type { ChartDatum } from './types';
import { tokenVar, safeDiv, clampRatio } from './utils';
import { ChartEnter } from './ChartEnter';

export interface ColumnChartProps {
  data: ChartDatum[];
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
}

const VB_W = 100;
const VB_H = 56;
const BASE_Y = 50;
const MAX_BAR_H = 42;

/** Vertical column chart — e.g. this month vs the last few months. */
export function ColumnChart({ data, formatValue = (v) => String(v), height = 120, className = '' }: ColumnChartProps) {
  const max = useMemo(() => data.reduce((m, d) => Math.max(m, Number.isFinite(d.value) ? d.value : 0), 0), [data]);
  const n = data.length;
  const isEmpty = n === 0 || max <= 0;

  const ariaLabel = isEmpty
    ? 'Monthly comparison: no spending recorded yet.'
    : `Monthly comparison: ${data.map((d) => `${d.label} ${formatValue(d.value)}`).join(', ')}.`;

  const gap = 3;
  const colWidth = safeDiv(VB_W - gap * (n + 1), Math.max(n, 1), VB_W);

  return (
    <ChartEnter className={className}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        <line x1={0} y1={BASE_Y} x2={VB_W} y2={BASE_Y} stroke={tokenVar('border')} strokeWidth={0.5} />
        {isEmpty
          ? null
          : data.map((d, i) => {
              const ratio = clampRatio(safeDiv(Math.max(0, d.value), max, 0));
              const barH = Math.max(ratio * MAX_BAR_H, d.value > 0 ? 1.5 : 0);
              const x = gap + i * (colWidth + gap);
              const y = BASE_Y - barH;
              return (
                <g key={d.id}>
                  <rect
                    x={x}
                    y={y}
                    width={colWidth}
                    height={barH}
                    rx={colWidth / 4}
                    fill={tokenVar(d.colorToken, 'accent')}
                  />
                  <text
                    x={x + colWidth / 2}
                    y={BASE_Y + 5.5}
                    fontSize={4.5}
                    textAnchor="middle"
                    fill="var(--text-3)"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
      </svg>
    </ChartEnter>
  );
}
