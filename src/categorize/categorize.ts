/**
 * Categorisation engine (CONTRACTS.md §5, §6). Priority order:
 *   1. User `Rule`s — the app learns from corrections, so these always win.
 *   2. Branded merchant dictionary.
 *   3. Generic (non-branded) keyword patterns.
 *   4. Fallback to "Other"/"Uncategorised" (or the first available category).
 *
 * Category *labels* from the dictionary are resolved against whatever `Category[]` the
 * store actually holds at runtime — ids are never hardcoded here (see dictionary.ts doc
 * comment) so this stays correct regardless of exactly how Agent 2 seeds built-ins.
 */
import type { Category, Rule } from '@/types';
import { cleanMerchant } from './normalize';
import { MERCHANT_DICTIONARY, GENERIC_PATTERNS, type DictionaryEntry } from './dictionary';

export type CategorizeMatchSource = 'rule' | 'dictionary' | 'generic' | 'unmatched';

export interface CategorizeResult {
  /** Cleaned merchant name to store/display (dictionary canonical name when matched). */
  merchant: string;
  categoryId: string;
  matchedBy: CategorizeMatchSource;
}

function resolveCategoryId(labels: string[], categories: Category[]): string {
  for (const label of labels) {
    const found = categories.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (found) return found.id;
  }
  const fallback = categories.find((c) => /other|uncategor/i.test(c.label));
  if (fallback) return fallback.id;
  return categories[0]?.id ?? '';
}

function matchEntry(paddedKey: string, entries: DictionaryEntry[]): DictionaryEntry | null {
  for (const entry of entries) {
    if (entry.patterns.some((p) => paddedKey.includes(p))) return entry;
  }
  return null;
}

/**
 * Categorise a raw transaction description: cleans the merchant, applies the user's
 * learned rules first, then the AU merchant dictionary, then generic keyword patterns,
 * and finally falls back to an "Other"/"Uncategorised" category.
 */
export function categorizeDescription(
  rawDescription: string,
  rules: Rule[],
  categories: Category[]
): CategorizeResult {
  const merchant = cleanMerchant(rawDescription);
  // Pad so single-word merchants (e.g. exactly "BP") still match space-delimited
  // patterns (e.g. " bp ") intended to avoid false positives like "Bpay".
  const paddedKey = ` ${merchant.toLowerCase()} `;

  // 1. User rules — longest match wins when more than one substring matches.
  const ruleMatches = rules.filter((r) => paddedKey.includes(r.match.toLowerCase()));
  if (ruleMatches.length > 0) {
    const best = ruleMatches.reduce((a, b) => (b.match.length > a.match.length ? b : a));
    return { merchant, categoryId: best.categoryId, matchedBy: 'rule' };
  }

  // 2. Branded dictionary.
  const branded = matchEntry(paddedKey, MERCHANT_DICTIONARY);
  if (branded) {
    return {
      merchant: branded.canonicalName || merchant,
      categoryId: resolveCategoryId(branded.categoryLabels, categories),
      matchedBy: 'dictionary',
    };
  }

  // 3. Generic patterns.
  const generic = matchEntry(paddedKey, GENERIC_PATTERNS);
  if (generic) {
    return { merchant, categoryId: resolveCategoryId(generic.categoryLabels, categories), matchedBy: 'generic' };
  }

  // 4. Unguessable (e.g. a local café) — default sensibly, leave it one tap from correct.
  return { merchant, categoryId: resolveCategoryId([], categories), matchedBy: 'unmatched' };
}
