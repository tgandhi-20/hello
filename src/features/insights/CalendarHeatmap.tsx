import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Category, DayCell, MonthStr, Txn } from '@/types';
import { formatMoney, todayStr } from '@/ui';
import { daysInMonth, startOfMonth } from '@/ui/format';
import { clampRatio } from '@/charts';
import { WEEKDAY_LABELS_MON_FIRST, mondayIndex, monthLabel, nextMonth, prevMonth } from './monthMath';
import { DayTransactionsSheet } from './DayTransactionsSheet';

export interface CalendarHeatmapProps {
  month: MonthStr;
  onMonthChange: (month: MonthStr) => void;
  cells: DayCell[];
  txns: Txn[];
  categories: Category[];
}

/** Blend from `--surface-sunk` (no spend) up to full `--accent` (busiest day) — one hue, varying
 * lightness/saturation via `color-mix`, so intensity reads correctly without relying on hue at all.
 * `--surface-sunk` (not `--surface`/white) so a zero-spend day still reads as a filled grid cell
 * against the white card behind it, per DESIGN-V3.md §1's inset-well use for that token.
 *
 * `intensity` itself is linear against the month's single highest day (store/selectors.ts). Spend
 * distributions are typically right-skewed — a handful of big days (a bill, a shop) alongside many
 * ordinary ones — so a linear map compresses every ordinary day into a narrow, visually-identical
 * low band while only the single outlier stands out. A sqrt curve is a standard contrast-stretch for
 * exactly this shape: it spreads the low-to-mid range out (where the days that actually need
 * distinguishing live) while still monotonically topping out at the real max, so the ramp stays an
 * honest, ordered representation of "more" vs "less" — just a legible one.
 *
 * Returns 0 for a zero-spend day, else 18-92 — the % of `--accent` mixed into the cell fill. */
function cellIntensityPct(intensity: number, hasSpend: boolean): number {
  if (!hasSpend) return 0;
  const perceptual = Math.sqrt(clampRatio(intensity));
  return Math.round(18 + perceptual * 74);
}

function cellBackground(pct: number): string {
  if (pct === 0) return 'var(--surface-sunk)';
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--surface-sunk))`;
}

/** Past the midpoint of the ramp the cell is dark enough that near-black `--ink-1` text
 * loses contrast — flip to `--ink-on-accent` (white) rather than let a busy day's figures
 * wash out. This is exactly the kind of dark-theme assumption that inverts on a light
 * ground: `--ink-1` reads fine on a pale tint but not on a saturated fill. */
function cellIsDark(pct: number): boolean {
  return pct >= 50;
}

/**
 * Month grid shaded by spend intensity (CONTRACTS.md §7). Colourblind-safe: a single hue
 * ramp varied by lightness (via `color-mix` against the surface, not by switching hues),
 * plus the amount is printed directly on the cell so colour is never the only signal.
 */
export function CalendarHeatmap({ month, onMonthChange, cells, txns, categories }: CalendarHeatmapProps) {
  const [selected, setSelected] = useState<DayCell | null>(null);
  const today = todayStr();

  const cellByDate = useMemo(() => new Map(cells.map((c) => [c.date, c])), [cells]);

  const grid = useMemo(() => {
    const total = daysInMonth(month);
    const leadingBlanks = mondayIndex(startOfMonth(month));
    const days: Array<DayCell | null> = new Array(leadingBlanks).fill(null);
    for (let d = 1; d <= total; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      days.push(cellByDate.get(date) ?? { date, totalCents: 0, txnCount: 0, intensity: 0 });
    }
    return days;
  }, [month, cellByDate]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onMonthChange(prevMonth(month))}
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 className="text-md font-semibold text-ink-1">{monthLabel(month)}</h2>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onMonthChange(nextMonth(month))}
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      {/*
        Design law: every touch target is >=48x48px, no exceptions (CONTRACTS.md §4). Seven
        columns of 48px cells need ~336px+ of width. `-mx-4` bleeds past this card's own
        16px padding on each side (reclaiming the 32px it costs) so that width comfortably
        fits inside a 412px viewport with room to spare; `minmax(48px, 1fr)` keeps cells at
        or above 48px regardless, and the `overflow-x-auto` (scoped to this grid, never the
        page body) is only a fallback for narrower devices, not the normal path.
      */}
      <div className="scroll-container -mx-4 overflow-x-auto px-1">
        <div
          className="grid gap-1 text-center text-xs text-ink-3"
          style={{ gridTemplateColumns: 'repeat(7, minmax(48px, 1fr))' }}
          aria-hidden="true"
        >
          {WEEKDAY_LABELS_MON_FIRST.map((w) => (
            <span key={w} className="py-1">
              {w}
            </span>
          ))}
        </div>

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: 'repeat(7, minmax(48px, 1fr))' }}
          role="grid"
          aria-label={`Spending calendar for ${monthLabel(month)}`}
        >
          {grid.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} aria-hidden="true" />;
            const hasSpend = cell.totalCents > 0;
            const isToday = cell.date === today;
            const dayNum = Number(cell.date.slice(8, 10));
            const pct = cellIntensityPct(cell.intensity, hasSpend);
            const dark = cellIsDark(pct);
            const fg = !hasSpend ? 'text-ink-3' : dark ? 'text-ink-on-accent' : 'text-ink-1';
            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                onClick={() => setSelected(cell)}
                aria-label={`${cell.date}: ${hasSpend ? formatMoney(cell.totalCents) : 'no spending'}${
                  cell.txnCount > 0 ? `, ${cell.txnCount} transaction${cell.txnCount === 1 ? '' : 's'}` : ''
                }`}
                className={[
                  'flex aspect-square min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] transition-transform duration-200 active:scale-95',
                  isToday ? 'ring-1 ring-accent' : '',
                ].join(' ')}
                style={{ backgroundColor: cellBackground(pct) }}
              >
                <span className={fg}>{dayNum}</span>
                {hasSpend ? <span className={['money leading-none', fg].join(' ')}>{formatMoney(cell.totalCents, { compact: true })}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <DayTransactionsSheet day={selected} txns={txns} categories={categories} onClose={() => setSelected(null)} />
    </div>
  );
}
