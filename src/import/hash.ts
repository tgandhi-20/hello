/**
 * Import dedupe hashing (CONTRACTS.md §6):
 * `sha256(date|amountCents|normalisedDescription|account|occurrence)`.
 *
 * This module deliberately contains no hashing logic of its own — it delegates
 * to `@/data/dedupe`, which is the single source of truth.
 *
 * Why that matters: the import preview tells the user "N new, M duplicates"
 * before they confirm, and the store recomputes the hash independently when it
 * actually writes. When those two used different normalisation functions they
 * disagreed on descriptions containing reference numbers, embedded dates or
 * trailing locations — so the preview could promise one outcome and the commit
 * deliver another. A preview that lies is worse than no preview.
 *
 * Note the normalisation is deliberately conservative: it collapses case,
 * punctuation and whitespace but does NOT strip reference numbers. Aggressive
 * merchant cleaning is right for *categorisation* (grouping a merchant's
 * transactions together) and wrong for *dedupe*, where over-matching silently
 * drops genuine transactions — a far worse outcome than surfacing a duplicate.
 *
 * The trailing `occurrence` index is what lets two genuinely distinct same-day,
 * same-amount, same-description, same-account rows (two identical coffees) hash
 * differently instead of colliding — see `@/data/dedupe`'s doc comment for the
 * full reasoning. `computeTxnHashBatch` is the batch-aware entry point import
 * preview and `addTxns` both use so occurrence assignment is consistent between
 * "what the preview promised" and "what actually got written".
 */
export {
  hashTxn as computeTxnHash,
  hashTxnsBatch as computeTxnHashBatch,
  normalizeDescription,
  dedupeGroupKey,
  type DedupeFields,
} from '@/data/dedupe';
