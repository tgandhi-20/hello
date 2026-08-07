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
