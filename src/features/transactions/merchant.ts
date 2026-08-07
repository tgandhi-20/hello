/**
 * Merchant name normalisation. Shared by the "always categorise X as Y" rule flow and
 * by the recurring-detection engine — both need to treat "WOOLWORTHS 2145 SYDNEY" and
 * "Woolworths 1198" as the same merchant.
 */

/** Lowercase, strip digits/punctuation/store-reference noise, collapse whitespace. */
export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(pty|ltd|au|aus|australia|store|shop)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A short substring suitable for a `Rule.match` — the first 1-2 significant words. */
export function ruleMatchFor(raw: string): string {
  const normalized = normalizeMerchant(raw);
  const words = normalized.split(' ').filter(Boolean);
  return words.slice(0, 2).join(' ') || normalized;
}

/** Title-case a normalised merchant string for display, e.g. "woolworths" -> "Woolworths". */
export function displayMerchant(normalized: string): string {
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
