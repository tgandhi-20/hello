/**
 * Shared types for the Tally chart kit (src/charts/**).
 *
 * All charts are hand-rolled inline SVG (CONTRACTS.md §1 — no chart library).
 * Every colour a chart draws must be a design token reference (`var(--token)`),
 * never a raw hex — pass `colorToken` values like `'cat-3'`, `'accent'`, `'positive'`.
 */

/** A single labelled value, e.g. one category's spend. */
export interface ChartDatum {
  id: string;
  label: string;
  /** Non-negative. Charts clamp negative input to 0 rather than draw a broken shape. */
  value: number;
  /** Token name only (no leading `--`), e.g. `'cat-1'`, `'accent'`, `'positive'`. */
  colorToken?: string;
}

export type SemanticTone = 'accent' | 'positive' | 'warning' | 'danger';
