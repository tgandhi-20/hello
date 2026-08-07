import React from 'react';
import type { ChartDatum } from './types';
import { tokenVar, safeDiv, clampRatio } from './utils';
import { ChartEnter } from './ChartEnter';

export interface BarListProps {
  data: ChartDatum[];
  formatValue?: (value: number) => string;
  maxItems?: number;
  /** Optional per-row leading element, e.g. a `<CategoryIcon>` — keeps this chart icon-agnostic. */
  renderLeading?: (datum: ChartDatum) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

/** Horizontal bar ranking, e.g. top spend categories. Bars scale against the row's own max value. */
export function BarList({
  data,
  formatValue = (v) => String(v),
  maxItems,
  renderLeading,
  emptyMessage = 'Nothing to show yet.',
  className = '',
}: BarListProps) {
  const cleaned = data
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxItems ?? data.length);
  const max = cleaned.reduce((m, d) => Math.max(m, d.value), 0);

  if (cleaned.length === 0) {
    return <p className={['text-sm text-ink-2', className].join(' ')}>{emptyMessage}</p>;
  }

  return (
    <ChartEnter className={className}>
      <ul
        className="flex flex-col gap-3"
        aria-label={`Ranked list: ${cleaned.map((d) => `${d.label} ${formatValue(d.value)}`).join(', ')}`}
      >
        {cleaned.map((d) => {
          const ratio = clampRatio(safeDiv(d.value, max, 0));
          return (
            <li key={d.id} className="flex items-center gap-3">
              {renderLeading ? renderLeading(d) : null}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-ink-1">{d.label}</span>
                  <span className="money shrink-0 text-sm text-ink-1">
                    {formatValue(d.value)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-2" aria-hidden="true">
                  <div
                    className="h-full rounded-pill"
                    style={{
                      width: `${ratio * 100}%`,
                      backgroundColor: tokenVar(d.colorToken, 'accent'),
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </ChartEnter>
  );
}
