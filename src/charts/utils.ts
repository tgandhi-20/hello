/**
 * Shared math/colour helpers for the chart kit. Every division that could hit zero
 * data or zero budget goes through `safeDiv`/`clampRatio` — dashboards like this one
 * break most often on divide-by-zero, so nothing in src/charts computes a raw `a / b`.
 */

/** Resolve a design-token name (e.g. `'cat-3'`, `'accent'`) to a CSS `var()` reference. */
export function tokenVar(token: string | undefined, fallback = 'text-3'): string {
  return `var(--${token && token.length > 0 ? token : fallback})`;
}

/** Divide two numbers, returning `fallback` (default 0) for divide-by-zero or non-finite results. */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/** Clamp a ratio to the [0, 1] range, coercing NaN/Infinity to 0. */
export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Clamp any number into [min, max], coercing NaN/Infinity to `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Sum of non-negative values (negative inputs are floored to 0 — a chart never draws negative area). */
export function sumNonNegative(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.max(0, Number.isFinite(v) ? v : 0), 0);
}

/** Format a 0–1 ratio as a whole-number percentage string, e.g. `"42%"`. Never NaN/Infinity. */
export function formatPercent(ratio: number): string {
  return `${Math.round(clampRatio(ratio) * 100)}%`;
}

/** Point on a circle of radius `r` centred at `(cx, cy)`, `angleDeg` measured clockwise from 12 o'clock. */
export function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * SVG path for a ring/donut segment arc (stroke-based ring, not a pie wedge).
 * Used to build multi-segment donuts by drawing several arcs on one circle.
 */
export function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const clampedEnd = endDeg - startDeg >= 359.999 ? startDeg + 359.999 : endDeg;
  const start = pointOnCircle(cx, cy, r, startDeg);
  const end = pointOnCircle(cx, cy, r, clampedEnd);
  const largeArc = clampedEnd - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

let uidCounter = 0;
/** Small, collision-safe id generator for SVG `id`/`clip-path` references (React 18 has no `useId` requirement here). */
export function nextChartId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}
