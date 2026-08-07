/**
 * Tally — dollars-string <-> integer-cents parsing for settings inputs.
 * No `parseFloat`/`toFixed` arithmetic on money — string-split integer math only,
 * per CONTRACTS.md §3 ("Money is stored as integer cents. Never floats.").
 */
import type { Cents } from '@/types';

/** Parse a user-typed dollar amount (e.g. "1,234.5", "$20") into integer cents. Null if unparseable. */
export function parseDollarsToCents(input: string): Cents | null {
  const trimmed = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [dollarsPart, centsPart = ''] = trimmed.split('.');
  const centsPadded = (centsPart + '00').slice(0, 2);
  return Number(dollarsPart) * 100 + Number(centsPadded);
}

/** Integer cents -> a plain (no currency symbol) editable string, e.g. `245000` -> `"2450.00"`. */
export function centsToPlainDollarsString(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return `${negative ? '-' : ''}${dollars}.${String(remainder).padStart(2, '0')}`;
}
