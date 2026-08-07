/**
 * Tally — encrypted backup file shape (CONTRACTS.md §5: "Backup export is encrypted").
 *
 * A `.tally` file is plain JSON on disk, but the only meaningful content
 * (`payload`) is AES-GCM ciphertext. `saltB64` and `verifier` are required so
 * a future `importBackup(file, pin)` can re-derive the exact same key from
 * the PIN the backup was created with (same PBKDF2 salt) and confirm it's
 * correct before attempting to decrypt real data.
 */
import type { Budget, Category, RecurringSeries, Rule, Settings, Txn } from '@/types';
import type { EncryptedBlob } from '@/security/crypto';

export interface BackupPayload {
  txns: Txn[];
  categories: Category[];
  budgets: Budget[];
  rules: Rule[];
  recurring: RecurringSeries[];
  settings: Settings;
}

export interface TallyBackupFile {
  format: 'tally-backup';
  version: 1;
  /** Unix ms — informational only, shown in the UI. */
  exportedAt: number;
  /** base64 PBKDF2 salt — not secret, needed to re-derive the key from the PIN on import. */
  saltB64: string;
  /** Lets importBackup confirm the supplied PIN is correct before touching real data. */
  verifier: EncryptedBlob;
  /** AES-GCM ciphertext of a JSON-serialised `BackupPayload`. */
  payload: EncryptedBlob;
}

export const TALLY_BACKUP_FORMAT = 'tally-backup' as const;
export const TALLY_BACKUP_VERSION = 1 as const;

/**
 * Validate a decrypted backup payload BEFORE the existing vault is cleared
 * (P0 fix — see useStore.ts's `importBackup` doc comment).
 *
 * Decryption succeeding proves only that the file was encrypted with a key
 * derived from the supplied PIN — not that its contents are a usable backup.
 * A restore is the one irreversible operation in an app with no server-side
 * copy, so it must fail before it destroys anything, never halfway through.
 *
 * Deliberately dependency-free (no IndexedDB/WebCrypto) so it's directly
 * node-testable — see src/store/__checks__/run.ts.
 *
 * Throws a message intended to be shown directly to the user.
 */
export function assertValidBackupPayload(payload: unknown): asserts payload is BackupPayload {
  const bad = (): never => {
    throw new Error('That backup file is incomplete or corrupted. Your data has not been changed.');
  };

  if (!payload || typeof payload !== 'object') bad();
  const p = payload as Record<string, unknown>;

  for (const field of ['txns', 'categories', 'budgets', 'rules', 'recurring'] as const) {
    if (!Array.isArray(p[field])) bad();
  }
  if (!p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) bad();

  // Spot-check element shape. A backup whose records are the wrong type would
  // otherwise restore "successfully" into a vault that renders as broken.
  const txns = p.txns as unknown[];
  for (const t of txns) {
    if (!t || typeof t !== 'object') bad();
    const r = t as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.date !== 'string' || typeof r.amountCents !== 'number') {
      bad();
    }
  }

  const categories = p.categories as unknown[];
  for (const c of categories) {
    if (!c || typeof c !== 'object') bad();
    const r = c as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.label !== 'string') bad();
  }
}
