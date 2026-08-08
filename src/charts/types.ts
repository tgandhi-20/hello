/**
 * Shared types for the Tally chart kit (src/charts/**).
 *
 * All charts are hand-rolled inline SVG (CONTRACTS.md §1 — no chart library).
 * Every colour a chart draws must be a design token reference (`var(--token)`),
 * never a raw hex — pass `colorToken` values like `'cat-3'`, `'accent'`, `'critical'`.
 */

/** A single labelled value, e.g. one category's spend. */
export interface ChartDatum {
  id: string;
  label: string;
  /** Non-negative. Charts clamp negative input to 0 rather than draw a broken shape. */
  value: number;
  /** Token name only (no leading `--`), e.g. `'cat-1'`, `'accent'`, `'critical'`. */
  colorToken?: string;
}

/**
 * DESIGN-V3.md §1: deliberately no "positive" tone — a second green would
 * collide with `--accent`, the app's one green. `SemanticTone` dropped
 * `'positive'` in the v3 repaint (it was `'accent' | 'positive' | 'caution' |
 * 'negative'` under v2); callers that need an "on track" / "good" read now
 * pass `'accent'` — on-track is the absence of a caution/critical tone, not
 * a colour of its own. `'negative'` is renamed `'critical'` to match the v3
 * token name.
 */
export type SemanticTone = 'accent' | 'caution' | 'critical';
