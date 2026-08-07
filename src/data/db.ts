/**
 * Tally — IndexedDB storage layer (CONTRACTS.md §5).
 *
 * This module knows nothing about PINs, keys, or plaintext. It only ever
 * stores and returns opaque `{iv, ct}` ciphertext blobs (see src/security/crypto.ts)
 * for financial object stores, plus a small `meta` store used for crypto
 * bookkeeping (salt, PIN verifier, biometric wrap) that is not itself
 * financial data.
 *
 * A raw dump of this IndexedDB database reveals no merchant names, no
 * amounts, no categories — nothing but ciphertext and ids. Ids are plain
 * (uuids) so records are addressable, but ids never encode financial data.
 *
 * Only src/store/** should import this file — other agents must go through
 * the store, never touch IndexedDB directly (CONTRACTS.md §9).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EncryptedBlob } from '@/security/crypto';

const DB_NAME = 'tally-db';
const DB_VERSION = 1;

/** The financial object stores — every value is ciphertext. */
export type DataStoreName = 'txns' | 'categories' | 'budgets' | 'rules' | 'recurring' | 'settings';

const DATA_STORE_NAMES: DataStoreName[] = [
  'txns',
  'categories',
  'budgets',
  'rules',
  'recurring',
  'settings',
];

interface EncryptedRecord {
  id: string;
  iv: string;
  ct: string;
}

interface MetaRecord {
  key: string;
  value: unknown;
}

interface TallySchema extends DBSchema {
  txns: { key: string; value: EncryptedRecord };
  categories: { key: string; value: EncryptedRecord };
  budgets: { key: string; value: EncryptedRecord };
  rules: { key: string; value: EncryptedRecord };
  recurring: { key: string; value: EncryptedRecord };
  settings: { key: string; value: EncryptedRecord };
  /** Non-financial crypto bookkeeping: PBKDF2 salt, PIN verifier, biometric wrap blob. */
  meta: { key: string; value: MetaRecord };
}

let dbPromise: Promise<IDBPDatabase<TallySchema>> | null = null;

function openDb(): Promise<IDBPDatabase<TallySchema>> {
  if (!dbPromise) {
    dbPromise = openDB<TallySchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of DATA_STORE_NAMES) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// meta store — crypto bookkeeping, not financial data
// ---------------------------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const rec = await db.get('meta', key);
  return rec?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put('meta', { key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  const db = await openDb();
  await db.delete('meta', key);
}

// ---------------------------------------------------------------------------
// financial stores — ciphertext blobs only
// ---------------------------------------------------------------------------

export async function getAllEncrypted(
  storeName: DataStoreName
): Promise<{ id: string; blob: EncryptedBlob }[]> {
  const db = await openDb();
  const records = await db.getAll(storeName);
  return records.map((r) => ({ id: r.id, blob: { iv: r.iv, ct: r.ct } }));
}

export async function putEncrypted(
  storeName: DataStoreName,
  id: string,
  blob: EncryptedBlob
): Promise<void> {
  const db = await openDb();
  await db.put(storeName, { id, iv: blob.iv, ct: blob.ct });
}

/**
 * Bulk write in a single IndexedDB transaction — critical for CSV imports of
 * thousands of rows, which must not be 5,000 separate round trips.
 */
export async function putManyEncrypted(
  storeName: DataStoreName,
  records: { id: string; blob: EncryptedBlob }[]
): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await Promise.all([
    ...records.map((r) => tx.store.put({ id: r.id, iv: r.blob.iv, ct: r.blob.ct })),
    tx.done,
  ]);
}

export async function deleteRecord(storeName: DataStoreName, id: string): Promise<void> {
  const db = await openDb();
  await db.delete(storeName, id);
}

/** Clears every financial record but keeps crypto meta (salt/verifier/biometric) intact. */
export async function clearAllData(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(DATA_STORE_NAMES, 'readwrite');
  await Promise.all([...DATA_STORE_NAMES.map((n) => tx.objectStore(n).clear()), tx.done]);
}

/** Wipes literally everything, including crypto meta. Used by a full account reset. */
export async function clearEverything(): Promise<void> {
  const db = await openDb();
  const allNames = [...DATA_STORE_NAMES, 'meta'] as const;
  const tx = db.transaction(allNames, 'readwrite');
  await Promise.all([...allNames.map((n) => tx.objectStore(n).clear()), tx.done]);
}
