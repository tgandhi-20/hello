/**
 * Tally — import dedupe hashing (CONTRACTS.md §6).
 *
 * hash = sha256(date | amountCents | normalisedDescription | account)
 *
 * Used by both manual entry and CSV import (via the store's `addTxn(s)`) so
 * re-importing an overlapping statement never double-counts.
 */
import { sha256Hex } from '@/security/crypto';
import type { AccountId, Cents, DateStr } from '@/types';

/** Lowercase, trim, collapse whitespace, strip punctuation noise — stable across re-exports of the same statement. */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function hashTxn(
  date: DateStr,
  amountCents: Cents,
  description: string,
  account: AccountId
): Promise<string> {
  const normalised = normalizeDescription(description);
  return sha256Hex(`${date}|${amountCents}|${normalised}|${account}`);
}
