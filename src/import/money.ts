/**
 * Tally — exact string-based money parsing (CONTRACTS.md §3, §6).
 *
 * Integer cents. Never a float. `parseFloat(x) * 100` introduces rounding error
 * (e.g. `0.1 + 0.2 !== 0.3`) — every amount here is parsed as a string and converted
 * to integer cents with integer arithmetic only.
 */
import type { Cents } from '@/types';

/**
 * Parse a monetary string into integer cents, preserving whatever sign was written in
 * the source file (i.e. this does NOT apply the app's spend-positive convention — see
 * `src/import/sign.ts` for that). Returns `null` if the string isn't recognisably money.
 *
 * Handles: `$1,234.56`, `1234.56`, `-$5`, `$-5.00`, `(45.00)` (accounting negative),
 * `45.00-` (trailing minus), thousands separators, missing decimals, and stray
 * whitespace/currency codes (`AUD`, `AU$`).
 */
export function parseMoneyToCents(raw: string): Cents | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;

  let negative = false;

  // Accounting-style parentheses negative: "(45.00)"
  const parenMatch = s.match(/^\((.*)\)$/);
  if (parenMatch) {
    negative = true;
    s = parenMatch[1].trim();
  }

  // Trailing minus: "45.00-"
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  // Leading minus (possibly before or after a currency symbol): "-$5.00" / "$-5.00" / "-5"
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }
  // Also strip a "+" some exports use for credits.
  if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  // Strip only known currency markers ($ sign, AUD/AU$ codes) — NOT letters generally.
  // A bare alphanumeric string (e.g. a reference code like "REF00981239") must never be
  // mistaken for money, so any other letters left after this fall through to rejection.
  s = s.replace(/\$/g, '').replace(/\bAUD\b/gi, '').replace(/\bAU\b/gi, '').trim();

  // A minus could still be hiding after the currency symbol was stripped, e.g. "$ -5.00"
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  if (s === '') return null;
  if (/[A-Za-z]/.test(s)) return null; // any remaining letters -> not a monetary string

  // Now expect something like "1,234.56" or "1234.56" or "1234" or ".56"
  if (!/^[\d.,\s]+$/.test(s)) return null;

  s = s.replace(/\s/g, '');

  // Thousands separator is ',' in en-AU; strip it entirely.
  s = s.replace(/,/g, '');

  if (s === '' || s === '.') return null;
  if (!/^\d*\.?\d*$/.test(s) || (s.match(/\./g) ?? []).length > 1) return null;

  const [wholeRaw, fracRaw = ''] = s.split('.');
  const whole = wholeRaw === '' ? '0' : wholeRaw;
  if (fracRaw.length > 2) {
    // More than 2 decimal places isn't a currency amount we can trust structurally
    // (could still be valid — truncate rather than reject, banks don't do sub-cent).
  }
  const frac = (fracRaw + '00').slice(0, 2);

  if (!/^\d+$/.test(whole) || !/^\d+$/.test(frac)) return null;

  const cents = Number(whole) * 100 + Number(frac);
  if (!Number.isFinite(cents)) return null;

  return negative ? -cents : cents;
}

/** True if the string looks like a monetary amount at all (used for column sniffing). */
export function looksLikeMoney(raw: string): boolean {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (s === '') return false;
  return parseMoneyToCents(s) !== null;
}
