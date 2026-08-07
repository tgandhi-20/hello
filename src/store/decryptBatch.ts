/**
 * Tally — resilient batch decryption (P0 fix core).
 *
 * `hydrateAll` (useStore.ts) used to decrypt every record in a store with a
 * bare `Promise.all`, which rejects on the FIRST failure — so one
 * unreadable transaction out of thousands failed the entire unlock,
 * silently and permanently (the vault would look like "wrong PIN" forever,
 * even with the correct PIN, because the caller never got far enough to say
 * otherwise). `decryptBatch` decrypts every record independently via
 * `Promise.allSettled`: the good ones come back, the bad ones are counted
 * and dropped rather than blocking access to everything else.
 *
 * Deliberately storage/crypto-agnostic (`decryptOne` is injected) so this is
 * node-testable without IndexedDB/WebCrypto — see src/store/__checks__/run.ts.
 * useStore.ts's `decryptAllWithIds` is a thin wrapper over this with the real
 * `getAllEncrypted`/`decryptJSON` plumbed in.
 */

export interface DecryptBatchResult<T> {
  items: T[];
  /** How many records failed to decrypt (and were skipped) in this batch. */
  skipped: number;
}

/**
 * Attempt `decryptOne` on every record in `records`, independently. Records
 * that succeed are returned in `items` (input order is not preserved across
 * failures — callers that need a stable order re-sort afterwards, as
 * `hydrateAll` already does for every store). Records that fail are counted
 * in `skipped`, never thrown, and never included in `items`.
 */
export async function decryptBatch<TRecord, TValue>(
  records: TRecord[],
  decryptOne: (record: TRecord) => Promise<TValue>
): Promise<DecryptBatchResult<TValue>> {
  const settled = await Promise.allSettled(records.map((r) => decryptOne(r)));
  const items: TValue[] = [];
  let skipped = 0;
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') items.push(outcome.value);
    else skipped++;
  }
  return { items, skipped };
}
