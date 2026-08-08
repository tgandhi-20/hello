/**
 * Account-id migration/validation — DESIGN-V3.md §5 / deliverable 4: splitting the
 * single `'cba'` bucket into `'cba'` (everyday account) and `'cba-card'` (credit
 * card) so statement-cycle prediction can tell them apart.
 *
 * NO DATA TRANSFORMATION IS ACTUALLY REQUIRED for this split. Adding `'cba-card'`
 * as a new possible `AccountId` value (src/types.ts) is purely additive to that
 * union. Every transaction already stored with `account: 'cba'` keeps EXACTLY
 * that value and EXACTLY that meaning (the everyday account) — nothing about it
 * changes, nothing is re-tagged, and no existing row can be silently relabelled
 * as a card by this split. `'cba-card'` only ever appears on a transaction the
 * user explicitly tags that way, from this point on.
 *
 * What this module actually guards against is a different, narrower risk: a
 * `Txn.account` field that is missing or holds a value outside the `AccountId`
 * union entirely (a hand-edited backup file, a future schema change, a bug
 * elsewhere) — the same "one bad field must not lose a transaction" principle
 * `src/store/decryptBatch.ts` already applies at the whole-record level. Rather
 * than dropping such a transaction (losing real financial history) or leaving an
 * invalid value sitting in state (a screen that keys off `AccountId` could
 * misrender), it defaults to `'cba'` — already the app's existing fallback
 * account elsewhere (see `EditSheet.tsx`'s initial state, `ImportScreen.tsx`'s
 * default) — the least surprising, most reversible choice. `src/store/useStore.ts`
 * calls this once per hydrate and once on backup restore; on any vault where the
 * type split is the only thing that changed, `migratedCount` is always 0.
 */
import type { AccountId, Txn } from '@/types';

export const ACCOUNT_IDS: readonly AccountId[] = ['cba', 'cba-card', 'bankwest', 'amex', 'cash'];

/** The safe default for a transaction whose stored account value can't be trusted. */
export const FALLBACK_ACCOUNT_ID: AccountId = 'cba';

export function isValidAccountId(value: unknown): value is AccountId {
  return typeof value === 'string' && (ACCOUNT_IDS as readonly string[]).includes(value);
}

export interface AccountMigrationResult {
  /** Every input transaction, in the same order, with any invalid `account` field repaired. */
  txns: Txn[];
  /** How many transactions needed repair. 0 on any vault where nothing was actually corrupt. */
  migratedCount: number;
  /** Ids of the repaired transactions, for a caller that wants to write back only what changed. */
  changedIds: string[];
}

/**
 * Ensure every transaction carries a valid `AccountId`. Valid rows (which is
 * every row in the overwhelming common case — see this file's header) are
 * returned by the SAME object reference, unchanged, so a caller can cheaply
 * tell "nothing needed fixing" (`migratedCount === 0`) from "N rows were
 * repaired" without a deep comparison.
 */
export function migrateTxnAccounts(txns: readonly Txn[]): AccountMigrationResult {
  const changedIds: string[] = [];
  const out = txns.map((t) => {
    if (isValidAccountId(t.account)) return t;
    changedIds.push(t.id);
    return { ...t, account: FALLBACK_ACCOUNT_ID };
  });
  return { txns: out, migratedCount: changedIds.length, changedIds };
}
