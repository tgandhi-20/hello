/**
 * Dedupe helpers (CONTRACTS.md §6). The actual skip-on-duplicate write path lives in the
 * store's `addTxns` (§9) — this module only helps the import preview show an accurate
 * "N new, M duplicates skipped" count *before* anything is committed.
 */
import type { Txn } from '@/types';

/** Build the set of existing dedupe hashes from the store's current transactions. */
export function existingHashSet(txns: readonly Txn[]): ReadonlySet<string> {
  return new Set(txns.map((t) => t.hash));
}
