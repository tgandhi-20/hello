/**
 * Tally — import dedupe hashing (CONTRACTS.md §6).
 *
 * hash = sha256(date | amountCents | normalisedDescription | account | occurrence)
 *
 * Used by both manual entry and CSV import (via the store's `addTxn(s)`) so
 * re-importing an overlapping statement never double-counts.
 *
 * ## Why `occurrence` exists
 *
 * The contract's hash formula alone — sha256(date|amountCents|description|account) —
 * collapses two genuinely distinct transactions that happen to share all four fields:
 * two identical $5.50 coffees at the same café on the same day, paid on the same card.
 * That is not a hypothetical; it is completely ordinary. Hashing those two rows to the
 * same value makes the second one indistinguishable from "the first one, seen again in
 * a re-imported statement" — so it silently gets dropped as a duplicate. Real money
 * would vanish with no hint to the user.
 *
 * The fix distinguishes "the same row, encountered again in an overlapping import"
 * from "two different rows that happen to look alike": every row also carries an
 * `occurrence` index — 0 for the first row seen with a given (date, amount,
 * description, account) key *within the batch being hashed*, 1 for the next one seen
 * with that same key, and so on. Two identical rows in one file get occurrence 0 and 1
 * and hash differently, so both survive. Re-importing the same file re-derives
 * occurrence 0 and 1 for the same two rows (in whichever order they appear — see
 * `hashOccurrences` below), reproducing the same two hashes, so both are correctly
 * recognised as duplicates. Import a file with a third identical row when two are
 * already stored: occurrence 0 and 1 match what's already there (duplicates),
 * occurrence 2 is new — exactly the "1 new, 2 duplicates" a human would expect.
 *
 * `occurrence` defaults to 0 for single-row callers (manual entry, editing one
 * transaction) — there is no "batch" to enumerate against, and manual entry
 * (`addTxn`) never dedupes against existing hashes in the first place (see
 * `useStore.ts`), so two identical quick-add entries are never silently swallowed.
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

/** The fields the dedupe hash is derived from, before `occurrence` is applied. */
export interface DedupeFields {
  date: DateStr;
  amountCents: Cents;
  description: string;
  account: AccountId;
}

/** The (date, amountCents, normalisedDescription, account) grouping key, with no occurrence baked in. */
export function dedupeGroupKey(fields: DedupeFields): string {
  const normalised = normalizeDescription(fields.description);
  return `${fields.date}|${fields.amountCents}|${normalised}|${fields.account}`;
}

export async function hashTxn(
  date: DateStr,
  amountCents: Cents,
  description: string,
  account: AccountId,
  occurrence = 0
): Promise<string> {
  const groupKey = dedupeGroupKey({ date, amountCents, description, account });
  return sha256Hex(`${groupKey}|${occurrence}`);
}

/**
 * Hash a whole batch of rows at once, assigning each a stable `occurrence` index —
 * 0, 1, 2, … — per distinct (date, amountCents, normalisedDescription, account) group,
 * in the order the rows appear in `rows`. Returned hashes are in the same order as
 * `rows`.
 *
 * Order-independence: because rows sharing a group key are, by definition,
 * indistinguishable from each other (same date/amount/description/account), it does
 * not matter *which* physical row within a group receives occurrence 0 vs. 1 vs. 2 —
 * the *set* of hashes a group produces is identical regardless of the rows' order
 * within the file. Reordering a CSV's rows therefore never changes dedupe behaviour.
 */
export async function hashTxnsBatch(rows: readonly DedupeFields[]): Promise<string[]> {
  const counts = new Map<string, number>();
  const hashes: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const groupKey = dedupeGroupKey(r);
    const occurrence = counts.get(groupKey) ?? 0;
    counts.set(groupKey, occurrence + 1);
    hashes[i] = await hashTxn(r.date, r.amountCents, r.description, r.account, occurrence);
  }
  return hashes;
}
