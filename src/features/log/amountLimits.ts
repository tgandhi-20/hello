/**
 * Tally — shared ceiling for anywhere a user types a dollar amount by hand.
 *
 * The quick-add keypad (`Keypad.tsx`, via `applyKey`'s `MAX_INT_DIGITS`) and
 * `BudgetRow`'s monthly-cap `<input type="number">` both need to enforce the
 * same maximum — see `BudgetRow.tsx`'s doc comment for the P2 bug an
 * unclamped budget cap caused (30 nines typed in, persisted, and rendered as
 * a >10^30-cent figure that corrupted the Budgets aggregate). Kept as one
 * shared constant/function here rather than two that could silently drift
 * apart.
 *
 * Deliberately dependency-free (no React/lucide-react/`@/` aliases) so this
 * is directly node-testable without a bundler — see
 * src/store/__checks__/run.ts.
 */
import type { Cents } from '../../types';

/** Digits allowed in the integer part of a typed amount — caps entry at $999,999.99. */
export const MAX_INT_DIGITS = 6;

export const MAX_AMOUNT_CENTS: Cents = 99_999_999; // $999,999.99

/** Clamp a cents value into `[0, MAX_AMOUNT_CENTS]`. Pure, side-effect-free. */
export function clampAmountCents(cents: Cents): Cents {
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return Math.min(cents, MAX_AMOUNT_CENTS);
}
