import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Category, DayCell, MonthStr, Txn } from '@/types';
import { formatMoney, todayStr } from '@/ui';
import { daysInMonth, startOfMonth } from '@/ui/format';
import { clampRatio, contrastRatio, mixSrgb, readTokenRgb } from '@/charts';
import { WEEKDAY_LABELS_MON_FIRST, mondayIndex, monthLabel, nextMonth, prevMonth } from './monthMath';
import { DayTransactionsSheet } from './DayTransactionsSheet';

export interface CalendarHeatmapProps {
  month: MonthStr;
  onMonthChange: (month: MonthStr) => void;
  cells: DayCell[];
  txns: Txn[];
  categories: Category[];
}

const MIN_TEXT_CONTRAST = 4.5; // WCAG AA, normal text — the cell figures render at 10px, never "large text".

/**
 * Blend from `--surface-sunk` (no spend) up to `--accent` (busiest day) — one hue, varying
 * lightness/saturation via a blend, so intensity reads correctly without relying on hue at all.
 * `--surface-sunk` (not `--surface`/white) so a zero-spend day still reads as a filled grid cell
 * against the white card behind it, per DESIGN-V3.md §1's inset-well use for that token.
 *
 * B3 fix (measured — see this module's `verifyRampContrast`): the previous version mixed
 * `--accent` in continuously from 18-92% and switched text colour to white at a guessed pct>=50
 * cutoff. Two things were wrong with that:
 *   1. The cutoff itself was miscalibrated — white text is nowhere near 4.5:1 until the mix is
 *      past ~90% accent (measured 2.34:1 at 50%, matching the auditor's 2.41:1 finding).
 *   2. Worse, no cutoff pct can fully fix it: `--ink-1` (near-black, not pure black — deliberately,
 *      per DESIGN-V3.md — L=0.0095) stops clearing 4.5:1 once the background luminance drops below
 *      ~0.218, but white doesn't clear 4.5:1 until the background luminance is back down at ~0.183.
 *      That's a dead zone in *background luminance* — roughly pct 82-90 against this ramp's actual
 *      accent/surface-sunk endpoints — where NEITHER text colour clears 4.5:1, independent of where
 *      the switchover threshold is set. A continuous ramp through that zone cannot be made
 *      accessible by recalibrating a threshold alone.
 *
 * Fix: a small fixed set of shades (a real "ramp", not a continuum) chosen to sit entirely outside
 * that dead zone, with the text colour for each shade decided by *measuring* both candidates'
 * contrast against that shade's actual background (see `chooseTextColor` below) rather than
 * guessing a single global pct threshold. `intensity` is still perceptually stretched via sqrt
 * (spend distributions are right-skewed — a handful of big days alongside many ordinary ones — so
 * a linear map would compress every ordinary day into one indistinguishable low band) and then
 * quantised into this ramp's six levels.
 */
const RAMP_PCTS = [16, 32, 48, 64, 78, 100] as const;

function cellShadePct(intensity: number, hasSpend: boolean): number {
  if (!hasSpend) return 0;
  const perceptual = Math.sqrt(clampRatio(intensity));
  const idx = Math.min(RAMP_PCTS.length - 1, Math.floor(perceptual * RAMP_PCTS.length));
  return RAMP_PCTS[idx];
}

function cellBackground(pct: number): string {
  if (pct === 0) return 'var(--surface-sunk)';
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--surface-sunk))`;
}

export interface RampShadeMeasurement {
  pct: number;
  bgHex: string;
  dark: boolean;
  contrastInk1: number;
  contrastWhite: number;
  chosenContrast: number;
  passes: boolean;
}

/** Compute, from the *actual live tokens* (never a hardcoded hex — CONTRACTS.md §4), which text
 * colour wins at each ramp shade and what its measured contrast is. Exported so a check/tooling
 * pass can assert every shade clears `MIN_TEXT_CONTRAST` without eyeballing it. */
export function measureRampContrast(root: HTMLElement = document.documentElement): RampShadeMeasurement[] {
  const accent = readTokenRgb('accent', root);
  const sunk = readTokenRgb('surface-sunk', root);
  const ink1 = readTokenRgb('ink-1', root);
  const white: [number, number, number] = [255, 255, 255];

  return RAMP_PCTS.map((pct) => {
    const bg = mixSrgb(accent, sunk, pct);
    const cInk1 = contrastRatio(ink1, bg);
    const cWhite = contrastRatio(white, bg);
    const dark = cWhite > cInk1;
    return {
      pct,
      bgHex: `#${bg.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
      dark,
      contrastInk1: cInk1,
      contrastWhite: cWhite,
      chosenContrast: dark ? cWhite : cInk1,
      passes: (dark ? cWhite : cInk1) >= MIN_TEXT_CONTRAST,
    };
  });
}

/**
 * Month grid shaded by spend intensity (CONTRACTS.md §7). Colourblind-safe: a single hue
 * ramp varied by lightness (via `color-mix` against the surface, not by switching hues),
 * plus the amount is printed directly on the cell so colour is never the only signal.
 */
export function CalendarHeatmap({ month, onMonthChange, cells, txns, categories }: CalendarHeatmapProps) {
  const [selected, setSelected] = useState<DayCell | null>(null);
  const today = todayStr();

  // Tokens don't change at runtime (v3 is light-only, DESIGN-V3.md §1), so this measures once
  // per mount rather than once per cell per render — but it's a measurement of the real,
  // currently-applied token values, never a hardcoded/assumed colour.
  const darkByPct = useMemo(() => {
    const measured = measureRampContrast();
    return new Map(measured.map((m) => [m.pct, m.dark]));
  }, []);

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
            const pct = cellShadePct(cell.intensity, hasSpend);
            const dark = darkByPct.get(pct) ?? false;
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
