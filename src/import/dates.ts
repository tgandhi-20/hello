/**
 * Date parsing for CSV import. Reuses Agent 1's `parseAuDate` (DD/MM/YYYY, day-first —
 * never re-implemented) and adds a couple of formats seen in the wild: ISO `YYYY-MM-DD`
 * and Amex's occasional `DD Mon YYYY`.
 */
import type { DateStr } from '@/types';
import { parseAuDate } from '@/ui/format';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAME_RE = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})$/;

/**
 * Parse a date string that appears in an AU bank CSV export. Tries, in order:
 * `DD/MM/YYYY` / `DD/MM/YY` (via `parseAuDate` — day-first, never month-first),
 * ISO `YYYY-MM-DD`, and `DD Mon YYYY` / `DD-Mon-YYYY`.
 * Returns `null` (never throws) so callers can use it for column sniffing.
 */
export function tryParseDate(raw: string): DateStr | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;

  const iso = s.match(ISO_RE);
  if (iso) {
    const [, y, m, d] = iso;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  const named = s.match(MONTH_NAME_RE);
  if (named) {
    const [, dRaw, monRaw, yRaw] = named;
    const mon = MONTH_NAMES[monRaw.slice(0, 3).toLowerCase()];
    if (mon) {
      const day = Number(dRaw);
      let year = Number(yRaw);
      if (yRaw.length === 2) year = year <= 69 ? 2000 + year : 1900 + year;
      if (day >= 1 && day <= 31) {
        return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  }

  try {
    return parseAuDate(s);
  } catch {
    return null;
  }
}

/** True if the string parses as a recognisable date (used for column/header sniffing). */
export function looksLikeDate(raw: string): boolean {
  return tryParseDate(raw) !== null;
}

/** Compare two DateStr values: negative if a < b, positive if a > b, 0 if equal. */
export function compareDateStr(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
