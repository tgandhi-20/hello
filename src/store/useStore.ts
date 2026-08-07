/**
 * Tally — the single zustand store (CONTRACTS.md §9, FROZEN interface).
 *
 * Every other feature agent reads/writes exclusively through this hook.
 * Nobody else touches src/data/db.ts or src/security/crypto.ts directly.
 *
 * Encryption model: every mutation encrypts its value with the in-memory
 * vault key (src/security/crypto.ts) before it ever reaches IndexedDB
 * (src/data/db.ts). `hydrated` flips true only once every store has been
 * decrypted after a successful unlock.
 */
import { create } from 'zustand';
import type {
  Budget,
  Category,
  Cents,
  MonthStr,
  RecurringSeries,
  Rule,
  Settings,
  Txn,
  LockState,
} from '@/types';
import {
  deriveKey,
  generateSalt,
  encryptJSON,
  decryptJSON,
  makeVerifier,
  checkVerifier,
  getActiveKey,
  setActiveKey,
  zeroKey,
  base64ToBuf,
  bufToBase64,
  type EncryptedBlob,
  type WrappedKeyBlob,
} from '@/security/crypto';
import {
  isBiometricAvailable,
  registerBiometricCredential,
  wrapKeyWithBiometric,
  unwrapKeyWithBiometric,
  type BiometricRegistration,
} from '@/security/biometric';
import {
  DEFAULT_PIN_LENGTH,
  DEFAULT_UNLOCK_CONFIG,
  type UnlockConfig,
} from '@/security/unlockMode';
import {
  getMeta,
  setMeta,
  deleteMeta,
  getAllEncrypted,
  putEncrypted,
  putManyEncrypted,
  deleteRecord,
  clearAllData,
  clearEverything,
  type DataStoreName,
} from '@/data/db';
import { withVaultLock } from './vaultLock';
import { decryptBatch, type DecryptBatchResult } from './decryptBatch';
import { buildDefaultCategories, DEFAULT_PINNED_CATEGORY_IDS } from '@/data/defaultCategories';
import { generateDemoTxns } from '@/data/demoData';
import { PLAN_DEFAULTS } from '@/personal/plan';
import { applyPersonalPlan } from '@/personal/applyPersonalPlan';
import { hashTxn, dedupeGroupKey } from '@/data/dedupe';
import { planCategoryDeletion, resolveFallbackCategoryId } from './categoryDeletion';
import {
  TALLY_BACKUP_FORMAT,
  TALLY_BACKUP_VERSION,
  assertValidBackupPayload,
  type BackupPayload,
  type TallyBackupFile,
} from '@/data/backup';

const SETTINGS_ID = 'settings';
const DEFAULT_LOCK_TIMEOUT_MS = 120_000; // 2 minutes, CONTRACTS.md §5

// Sourced from src/personal/plan.ts (docs/PERSONAL.md §2/§6) rather than
// re-typed here — that file is the single source of truth for these figures.
const DEFAULT_SETTINGS: Settings = {
  currency: 'AUD',
  locale: 'en-AU',
  paydayDayOfMonth: PLAN_DEFAULTS.paydayDayOfMonth, // 15th
  monthlyIncomeCents: PLAN_DEFAULTS.monthlyIncomeCents, // $6,457
  savingsTargetCents: PLAN_DEFAULTS.savingsTargetCents, // $3,500
  lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
  biometricEnabled: false,
  pinnedCategoryIds: [...DEFAULT_PINNED_CATEGORY_IDS],
  // moveInDate and hasHecsDebt intentionally start unset (docs/PERSONAL.md
  // §2/§7): both must be explicit one-time setup answers, never silently
  // assumed. A settings/onboarding screen should prompt for both.
};

export interface TallyStore {
  // --- state ---
  lockState: LockState;
  hydrated: boolean;
  txns: Txn[];
  categories: Category[];
  budgets: Budget[];
  rules: Rule[];
  recurring: RecurringSeries[];
  settings: Settings;
  /**
   * How many records across all stores failed to decrypt on the most recent
   * hydrate and were skipped rather than blocking the whole unlock (P0 fix —
   * see `decryptAllWithIds`'s doc comment). 0 on a clean vault. Not part of
   * CONTRACTS.md §9's frozen interface, but additive and required to be able
   * to tell the user honestly that some data was lost instead of hiding it.
   */
  skippedRecordCount: number;

  // --- lock lifecycle ---
  setupPin(pin: string): Promise<void>;
  unlock(pin: string): Promise<boolean>;
  unlockBiometric(): Promise<boolean>;
  enableBiometric(): Promise<boolean>;
  lock(): void;

  // --- mutations ---
  addTxn(t: Omit<Txn, 'id' | 'hash' | 'createdAt' | 'updatedAt'>): Promise<Txn>;
  addTxns(ts: Omit<Txn, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<{ added: number; skipped: number }>;
  updateTxn(id: string, patch: Partial<Txn>): Promise<void>;
  deleteTxn(id: string): Promise<void>;
  setBudget(categoryId: string, month: MonthStr, limitCents: Cents): Promise<void>;
  addCategory(c: Omit<Category, 'id'>): Promise<Category>;
  updateCategory(id: string, patch: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  addRule(match: string, categoryId: string): Promise<void>;
  setRecurring(series: RecurringSeries[]): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;

  // --- data management ---
  exportBackup(): Promise<Blob>;
  importBackup(file: File, pin: string): Promise<void>;
  resetAll(): Promise<void>;
  loadDemoData(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers — encryption glue between crypto.ts and db.ts.
// ---------------------------------------------------------------------------

function requireKey(): CryptoKey {
  const key = getActiveKey();
  if (!key) throw new Error('Tally is locked.');
  return key;
}

async function encryptAndPut(storeName: DataStoreName, key: CryptoKey, id: string, value: unknown): Promise<void> {
  const blob = await encryptJSON(key, value);
  await putEncrypted(storeName, id, blob);
}

async function encryptAndPutMany(
  storeName: DataStoreName,
  key: CryptoKey,
  records: { id: string; value: unknown }[]
): Promise<void> {
  if (records.length === 0) return;
  const blobs = await Promise.all(
    records.map(async (r) => ({ id: r.id, blob: await encryptJSON(key, r.value) }))
  );
  await putManyEncrypted(storeName, blobs);
}

/**
 * Decrypt every record in a store, tolerating individual failures (P0 fix —
 * see decryptBatch.ts's doc comment for the bug this closes and why the core
 * logic lives there instead of here: it needs to be node-testable without
 * IndexedDB/WebCrypto). A vault with 1 bad record out of 3,000 must still
 * open with 2,999 intact — see `hydrateAll` and LockGate's skipped-record
 * toast for where the skipped count surfaces to the user.
 *
 * Deliberately does not log anything about *why* a record failed (wrong key
 * vs malformed JSON vs truncated ciphertext) — any such detail risks leaking
 * something about encrypted financial data into the console (CONTRACTS.md §5).
 */
async function decryptAllWithIds<T>(
  storeName: DataStoreName,
  key: CryptoKey
): Promise<DecryptBatchResult<{ id: string; value: T }>> {
  const records = await getAllEncrypted(storeName);
  return decryptBatch(records, async (r) => ({ id: r.id, value: await decryptJSON<T>(key, r.blob) }));
}

async function decryptAll<T>(storeName: DataStoreName, key: CryptoKey): Promise<DecryptBatchResult<T>> {
  const withIds = await decryptAllWithIds<T>(storeName, key);
  return { items: withIds.items.map((r) => r.value), skipped: withIds.skipped };
}

/**
 * Shared bootstrap for a brand-new vault — used by both `setupPin` (frozen
 * §9 interface) and the standalone `setupPassphrase` below. Writes the salt,
 * verifier, and `unlockConfig` (which mode + PIN length, if any — see
 * `unlockMode.ts`; not secret, needed by the lock screen before unlock) to
 * the plain `meta` store, then seeds default categories/settings under the
 * new key.
 */
async function initializeFreshVault(
  secret: string,
  config: UnlockConfig
): Promise<{ key: CryptoKey; categories: Category[]; settings: Settings }> {
  const salt = generateSalt();
  const key = await deriveKey(secret, salt);
  const verifier = await makeVerifier(key);
  await setMeta('salt', bufToBase64(salt));
  await setMeta('verifier', verifier);
  await setMeta('unlockConfig', config);
  setActiveKey(key);

  const categories = buildDefaultCategories();
  const settings: Settings = { ...DEFAULT_SETTINGS };

  await encryptAndPutMany(
    'categories',
    key,
    categories.map((c) => ({ id: c.id, value: c }))
  );
  await encryptAndPut('settings', key, SETTINGS_ID, settings);

  return { key, categories: sortCategories(categories), settings };
}

function compareTxnDesc(a: Txn, b: Txn): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}
function sortTxns(txns: Txn[]): Txn[] {
  return [...txns].sort(compareTxnDesc);
}
function sortCategories(cats: Category[]): Category[] {
  return [...cats].sort((a, b) => a.order - b.order);
}

/**
 * Budgets have no `id` in their type (CONTRACTS.md §3/types.ts), but IndexedDB
 * records need a stable key. We generate an opaque uuid per (categoryId, month)
 * pair and keep the mapping only in memory, rebuilt from decrypted data on
 * every hydrate — the id itself is never part of the plaintext Budget value.
 */
const budgetIndex = new Map<string, string>();
function budgetMapKey(categoryId: string, month: MonthStr): string {
  return `${categoryId}::${month}`;
}

// `assertValidBackupPayload` (validate a decrypted backup BEFORE the existing
// vault is cleared) now lives in @/data/backup — moved so it's node-testable
// without pulling in this file's IndexedDB/WebCrypto/WebAuthn dependency
// graph; see that file's doc comment and src/store/__checks__/run.ts.

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const useStore = create<TallyStore>((set, get) => {
  // Determine uninitialised vs locked as soon as possible after first render.
  // Always starts as 'locked' optimistically to avoid a first-run flash; if
  // no salt exists yet this flips to 'uninitialised' a tick later.
  //
  // P1 fix: this used to be a bare unawaited IIFE with no error handling. If
  // IndexedDB is missing entirely (some locked-down browsers) or throws on
  // open (private/incognito mode in several browsers), `getMeta` rejects,
  // `set()` above never runs, and `lockState` silently stays at its initial
  // 'locked' default — so the app renders a normal PIN screen for a vault
  // that structurally cannot exist, and any PIN the user types fails
  // forever with no explanation. Feature-detect first, and catch the open
  // itself, so that case gets its own explicit `'unsupported'` state instead
  // (see LockScreen.tsx's dedicated screen for it).
  void (async () => {
    if (typeof indexedDB === 'undefined') {
      set({ lockState: 'unsupported' });
      return;
    }
    try {
      const salt = await getMeta<string>('salt');
      set({ lockState: salt ? 'locked' : 'uninitialised' });
    } catch {
      set({ lockState: 'unsupported' });
    }
  })();

  async function hydrateAll(key: CryptoKey): Promise<void> {
    const [txns, categories, budgetRecords, rules, recurring, settingsArr] = await Promise.all([
      decryptAll<Txn>('txns', key),
      decryptAll<Category>('categories', key),
      decryptAllWithIds<Budget>('budgets', key),
      decryptAll<Rule>('rules', key),
      decryptAll<RecurringSeries>('recurring', key),
      decryptAll<Settings>('settings', key),
    ]);

    // P0 fix: total records across every store that failed to decrypt and
    // were skipped rather than failing the whole unlock — see
    // `decryptAllWithIds`'s doc comment. Surfaced honestly to the user by
    // LockGate rather than hidden, but never blocks access to the rest.
    const skippedRecordCount =
      txns.skipped +
      categories.skipped +
      budgetRecords.skipped +
      rules.skipped +
      recurring.skipped +
      settingsArr.skipped;

    budgetIndex.clear();
    for (const rec of budgetRecords.items) {
      budgetIndex.set(budgetMapKey(rec.value.categoryId, rec.value.month), rec.id);
    }

    set({
      txns: sortTxns(txns.items),
      categories: sortCategories(categories.items),
      budgets: budgetRecords.items.map((r) => r.value),
      rules: rules.items,
      recurring: recurring.items,
      settings: settingsArr.items[0] ?? DEFAULT_SETTINGS,
      hydrated: true,
      lockState: 'unlocked',
      skippedRecordCount,
    });
  }

  function clearDecryptedState(nextLockState: LockState): void {
    budgetIndex.clear();
    set({
      lockState: nextLockState,
      hydrated: false,
      txns: [],
      categories: [],
      budgets: [],
      rules: [],
      recurring: [],
      settings: DEFAULT_SETTINGS,
      skippedRecordCount: 0,
    });
  }

  return {
    lockState: 'locked',
    hydrated: false,
    txns: [],
    categories: [],
    budgets: [],
    rules: [],
    recurring: [],
    settings: DEFAULT_SETTINGS,
    skippedRecordCount: 0,

    // --- lock lifecycle -----------------------------------------------

    async setupPin(pin) {
      // PIN length is whatever the caller actually typed (4–10 digits, chosen
      // on the setup screen) — no separate parameter needed, see unlockMode.ts.
      const { categories, settings } = await initializeFreshVault(pin, {
        mode: 'pin',
        pinLength: pin.length,
      });
      budgetIndex.clear();
      set({
        txns: [],
        categories,
        budgets: [],
        rules: [],
        recurring: [],
        settings,
        hydrated: true,
        lockState: 'unlocked',
        skippedRecordCount: 0,
      });
      // Seed the user's actual budget on a fresh vault, so the app arrives
      // already knowing their plan rather than presenting empty caps they'd
      // have to re-enter from a document they already wrote.
      await applyPersonalPlan(get());
    },

    async unlock(pin) {
      const saltB64 = await getMeta<string>('salt');
      const verifier = await getMeta<EncryptedBlob>('verifier');
      if (!saltB64 || !verifier) return false;

      const key = await deriveKey(pin, base64ToBuf(saltB64));
      const ok = await checkVerifier(key, verifier);
      if (!ok) return false;

      setActiveKey(key);
      await hydrateAll(key);
      return true;
    },

    async unlockBiometric() {
      try {
        const reg = await getMeta<BiometricRegistration>('biometricReg');
        const wrapped = await getMeta<WrappedKeyBlob>('biometricWrappedKey');
        const verifier = await getMeta<EncryptedBlob>('verifier');
        if (!reg || !wrapped || !verifier) return false;

        const key = await unwrapKeyWithBiometric(reg, wrapped);
        if (!key) return false; // unavailable, cancelled, or PRF unsupported — fall back to PIN

        const ok = await checkVerifier(key, verifier);
        if (!ok) return false;

        setActiveKey(key);
        await hydrateAll(key);
        return true;
      } catch {
        // Never let a biometric failure look like anything other than "use your PIN".
        return false;
      }
    },

    async enableBiometric() {
      try {
        const key = getActiveKey();
        if (!key) return false;

        const reg = await registerBiometricCredential();
        if (!reg) return false;

        const wrapped = await wrapKeyWithBiometric(key, reg);
        if (!wrapped) return false;

        await setMeta('biometricReg', reg);
        await setMeta('biometricWrappedKey', wrapped);
        await get().updateSettings({ biometricEnabled: true });
        return true;
      } catch {
        return false;
      }
    },

    lock() {
      zeroKey();
      clearDecryptedState('locked');
    },

    // --- mutations -------------------------------------------------------

    // Every mutation below acquires `withVaultLock` before it writes anything
    // to IndexedDB (P0 fix) — see src/store/vaultLock.ts's doc comment for
    // why: it's what stops an ordinary write from landing under the old key
    // mid-way through a PIN rotation or backup restore and being orphaned
    // when the key pointer flips. Do not call another wrapped store method
    // from inside one of these bodies — see vaultLock.ts's "NOT REENTRANT" note.

    async addTxn(t) {
      return withVaultLock(async () => {
        const key = requireKey();
        const hash = await hashTxn(t.date, t.amountCents, t.description, t.account);
        const now = Date.now();
        const txn: Txn = { ...t, id: crypto.randomUUID(), hash, createdAt: now, updatedAt: now };
        await encryptAndPut('txns', key, txn.id, txn);
        set((state) => ({ txns: sortTxns([...state.txns, txn]) }));
        return txn;
      });
    },

    async addTxns(ts) {
      return withVaultLock(async () => {
        const key = requireKey();
        const existingHashes = new Set(get().txns.map((t) => t.hash));
        const now = Date.now();
        const toInsert: Txn[] = [];
        let skipped = 0;

        // Per (date, amount, description, account) occurrence counter, scoped to this
        // batch — see `@/data/dedupe`'s doc comment. Two genuinely distinct rows that
        // share all four fields (two identical coffees on the same day) get occurrence
        // 0 and 1 and hash differently, so neither is mistaken for a duplicate of the
        // other. Re-adding the same batch later reproduces the same occurrence
        // sequence, so it correctly collides with `existingHashes` and is skipped.
        const occurrenceCounts = new Map<string, number>();

        for (const t of ts) {
          // The frozen §9 type still carries `hash` on this input (it's only
          // omitted on the singular addTxn), but the hash MUST be authoritative
          // dedupe data, not whatever the caller happened to pass — so it is
          // always recomputed here and the incoming value is ignored.
          const groupKey = dedupeGroupKey(t);
          const occurrence = occurrenceCounts.get(groupKey) ?? 0;
          occurrenceCounts.set(groupKey, occurrence + 1);
          const hash = await hashTxn(t.date, t.amountCents, t.description, t.account, occurrence);
          if (existingHashes.has(hash)) {
            skipped++;
            continue;
          }
          toInsert.push({ ...t, hash, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
        }

        if (toInsert.length > 0) {
          await encryptAndPutMany(
            'txns',
            key,
            toInsert.map((tx) => ({ id: tx.id, value: tx }))
          );
        }

        set((state) => ({ txns: sortTxns([...state.txns, ...toInsert]) }));
        return { added: toInsert.length, skipped };
      });
    },

    async updateTxn(id, patch) {
      return withVaultLock(async () => {
        const key = requireKey();
        const current = get().txns.find((t) => t.id === id);
        if (!current) return;

        const merged: Txn = { ...current, ...patch, id: current.id, updatedAt: Date.now() };
        // Keep the dedupe hash consistent with the fields it's derived from.
        if (
          patch.date !== undefined ||
          patch.amountCents !== undefined ||
          patch.description !== undefined ||
          patch.account !== undefined
        ) {
          merged.hash = await hashTxn(merged.date, merged.amountCents, merged.description, merged.account);
        }

        await encryptAndPut('txns', key, id, merged);
        set((state) => ({ txns: sortTxns(state.txns.map((t) => (t.id === id ? merged : t))) }));
      });
    },

    async deleteTxn(id) {
      return withVaultLock(async () => {
        requireKey();
        await deleteRecord('txns', id);
        set((state) => ({ txns: state.txns.filter((t) => t.id !== id) }));
      });
    },

    async setBudget(categoryId, month, limitCents) {
      return withVaultLock(async () => {
        const key = requireKey();
        const budget: Budget = { categoryId, month, limitCents };
        const mapKey = budgetMapKey(categoryId, month);
        let id = budgetIndex.get(mapKey);
        if (!id) {
          id = crypto.randomUUID();
          budgetIndex.set(mapKey, id);
        }
        await encryptAndPut('budgets', key, id, budget);
        set((state) => ({
          budgets: [
            ...state.budgets.filter((b) => !(b.categoryId === categoryId && b.month === month)),
            budget,
          ],
        }));
      });
    },

    async addCategory(c) {
      return withVaultLock(async () => {
        const key = requireKey();
        const category: Category = { ...c, id: crypto.randomUUID() };
        await encryptAndPut('categories', key, category.id, category);
        set((state) => ({ categories: sortCategories([...state.categories, category]) }));
        return category;
      });
    },

    async updateCategory(id, patch) {
      return withVaultLock(async () => {
        const key = requireKey();
        const current = get().categories.find((c) => c.id === id);
        if (!current) return;
        const updated: Category = { ...current, ...patch, id };
        await encryptAndPut('categories', key, id, updated);
        set((state) => ({
          categories: sortCategories(state.categories.map((c) => (c.id === id ? updated : c))),
        }));
      });
    },

    async deleteCategory(id) {
      return withVaultLock(async () => {
        const key = requireKey();
        const state = get();
        const current = state.categories.find((c) => c.id === id);
        if (!current) return;
        if (current.builtin) {
          throw new Error('Built-in categories cannot be deleted.');
        }

        // A deleted category must never leave dangling data behind: every transaction
        // pointed at it gets reassigned to a fallback (never an orphaned categoryId a
        // screen can't render), and every budget row for it is removed (never an
        // invisible amount permanently padding "total budgeted" — see
        // `categoryDeletion.ts`'s doc comment for the bug this fixes).
        const fallbackId = resolveFallbackCategoryId(state.categories, id);
        if (!fallbackId) {
          throw new Error('Cannot delete this category — Tally needs at least one other category to reassign its transactions to.');
        }

        const now = Date.now();
        const plan = planCategoryDeletion(state.txns, state.budgets, id, fallbackId, now);

        const budgetDeletes = plan.removedBudgetKeys
          .map(({ categoryId, month }) => budgetIndex.get(budgetMapKey(categoryId, month)))
          .filter((budgetId): budgetId is string => Boolean(budgetId));

        await Promise.all([
          deleteRecord('categories', id),
          encryptAndPutMany(
            'txns',
            key,
            plan.changedTxns.map((t) => ({ id: t.id, value: t }))
          ),
          ...budgetDeletes.map((budgetId) => deleteRecord('budgets', budgetId)),
        ]);

        for (const { categoryId, month } of plan.removedBudgetKeys) {
          budgetIndex.delete(budgetMapKey(categoryId, month));
        }

        set({
          categories: state.categories.filter((c) => c.id !== id),
          txns: sortTxns(plan.txns),
          budgets: plan.budgets,
        });
      });
    },

    async addRule(match, categoryId) {
      return withVaultLock(async () => {
        const key = requireKey();
        const rule: Rule = {
          id: crypto.randomUUID(),
          match: match.trim().toLowerCase(),
          categoryId,
          createdAt: Date.now(),
        };
        await encryptAndPut('rules', key, rule.id, rule);
        set((state) => ({ rules: [...state.rules, rule] }));
      });
    },

    async setRecurring(series) {
      return withVaultLock(async () => {
        const key = requireKey();
        const existingIds = new Set(get().recurring.map((r) => r.id));
        const nextIds = new Set(series.map((r) => r.id));
        const toDelete = [...existingIds].filter((id) => !nextIds.has(id));
        await Promise.all(toDelete.map((id) => deleteRecord('recurring', id)));
        await encryptAndPutMany(
          'recurring',
          key,
          series.map((r) => ({ id: r.id, value: r }))
        );
        set({ recurring: series });
      });
    },

    async updateSettings(patch) {
      return withVaultLock(async () => {
        const key = requireKey();
        const updated: Settings = { ...get().settings, ...patch };
        await encryptAndPut('settings', key, SETTINGS_ID, updated);
        set({ settings: updated });
      });
    },

    // --- data management ---------------------------------------------

    async exportBackup() {
      const key = requireKey();
      const saltB64 = await getMeta<string>('salt');
      const verifier = await getMeta<EncryptedBlob>('verifier');
      if (!saltB64 || !verifier) throw new Error('Vault not initialised.');

      const state = get();
      const payload: BackupPayload = {
        txns: state.txns,
        categories: state.categories,
        budgets: state.budgets,
        rules: state.rules,
        recurring: state.recurring,
        settings: state.settings,
      };

      const encryptedPayload = await encryptJSON(key, payload);
      const file: TallyBackupFile = {
        format: TALLY_BACKUP_FORMAT,
        version: TALLY_BACKUP_VERSION,
        exportedAt: Date.now(),
        saltB64,
        verifier,
        payload: encryptedPayload,
      };

      return new Blob([JSON.stringify(file)], { type: 'application/json' });
    },

    /**
     * Restore a `.tally` backup, replacing this device's entire vault.
     *
     * P0 fix — ordering used to be: clear the whole vault (data + meta),
     * THEN write the meta pointer and the new records. Two problems with
     * that: (1) it destroyed the existing vault before anything about the
     * new one was confirmed writable, and (2) even with the vault-wide write
     * lock now held for this whole call (see vaultLock.ts), a browser crash
     * or tab kill in the middle left the vault genuinely bricked — `meta`
     * pointing at a key whose records were only partially written.
     *
     * New ordering, mirroring `setUnlockSecret`'s fail-safe shape: validate
     * the payload, encrypt every record under the new key ENTIRELY IN
     * MEMORY (nothing on disk touched yet — a throw here leaves the vault
     * completely untouched), only THEN clear the existing financial data
     * (not `meta` — see below) and write the new records, verify a sample
     * reads back correctly, and only as the very last step flip `meta`
     * (salt/verifier) to the key `unlock()` will trust from now on. An
     * interruption between the clear and the meta flip leaves an empty vault
     * still under the OLD PIN — recoverable by re-running the import —
     * rather than a vault whose meta claims a key that doesn't match what's
     * actually on disk.
     */
    async importBackup(file, pin) {
      return withVaultLock(async () => {
        const text = await file.text();
        let parsed: TallyBackupFile;
        try {
          parsed = JSON.parse(text) as TallyBackupFile;
        } catch {
          throw new Error('That file is not a valid Tally backup.');
        }
        if (parsed.format !== TALLY_BACKUP_FORMAT || parsed.version !== TALLY_BACKUP_VERSION) {
          throw new Error('That file is not a valid Tally backup.');
        }

        const salt = base64ToBuf(parsed.saltB64);
        const key = await deriveKey(pin, salt);
        const ok = await checkVerifier(key, parsed.verifier);
        if (!ok) throw new Error('Incorrect PIN for this backup.');

        const payload = await decryptJSON<BackupPayload>(key, parsed.payload);

        // Validate the DECRYPTED payload before touching the existing vault.
        //
        // AES-GCM authentication only proves the ciphertext was produced by
        // someone holding the key — it says nothing about the plaintext's shape.
        // Anyone can author a well-formed .tally file with a PIN of their
        // choosing. If we cleared first and destructured second, a backup with a
        // missing array would wipe the user's entire financial history and then
        // throw, and with no backend there is no second copy to restore from.
        // Validate first, so a bad file fails harmlessly with the vault intact.
        assertValidBackupPayload(payload);

        // Encrypt everything under the new key up front, in memory only —
        // the existing vault on disk is not touched by any of this and is
        // still fully intact if any of it throws.
        const budgetsWithIds = payload.budgets.map((b) => ({ id: crypto.randomUUID(), value: b }));
        const [txnBlobs, categoryBlobs, budgetBlobs, ruleBlobs, recurringBlobs, settingsBlob] = await Promise.all([
          Promise.all(payload.txns.map(async (t) => ({ id: t.id, blob: await encryptJSON(key, t) }))),
          Promise.all(payload.categories.map(async (c) => ({ id: c.id, blob: await encryptJSON(key, c) }))),
          Promise.all(budgetsWithIds.map(async (b) => ({ id: b.id, blob: await encryptJSON(key, b.value) }))),
          Promise.all(payload.rules.map(async (r) => ({ id: r.id, blob: await encryptJSON(key, r) }))),
          Promise.all(payload.recurring.map(async (r) => ({ id: r.id, blob: await encryptJSON(key, r) }))),
          encryptJSON(key, { ...payload.settings, biometricEnabled: false }),
        ]);

        // Full restore: this device's local vault becomes an exact copy of the
        // backup's. Only the financial data is cleared here — `meta`
        // (salt/verifier, and `unlockConfig`) is left alone until the new
        // records are written and verified, below.
        await clearAllData();

        await Promise.all([
          putManyEncrypted('txns', txnBlobs),
          putManyEncrypted('categories', categoryBlobs),
          putManyEncrypted('budgets', budgetBlobs),
          putManyEncrypted('rules', ruleBlobs),
          putManyEncrypted('recurring', recurringBlobs),
          putEncrypted('settings', SETTINGS_ID, settingsBlob),
        ]);

        // Fail-safe verification: read back what was ACTUALLY committed (not
        // the in-memory payload) and confirm the new key genuinely decrypts
        // it before `meta` — the thing `unlock()` trusts — is allowed to move.
        const verified = await verifyKeyReadsBack(key, {
          settingsId: SETTINGS_ID,
          categoryId: payload.categories[0]?.id,
          txnId: payload.txns[0]?.id,
        });
        if (!verified) {
          throw new Error(
            'The restore could not be verified and was not completed. This device’s previous data has already been cleared — please try importing the backup again.'
          );
        }

        await setMeta('salt', parsed.saltB64);
        await setMeta('verifier', parsed.verifier);
        setActiveKey(key);
        // A WebAuthn credential is device-specific and cannot be carried over
        // by a backup, so biometric unlock is disabled and must be re-enabled.
        await deleteMeta('biometricReg');
        await deleteMeta('biometricWrappedKey');

        budgetIndex.clear();
        for (const rec of budgetsWithIds) {
          budgetIndex.set(budgetMapKey(rec.value.categoryId, rec.value.month), rec.id);
        }

        set({
          txns: sortTxns(payload.txns),
          categories: sortCategories(payload.categories),
          budgets: payload.budgets,
          rules: payload.rules,
          recurring: payload.recurring,
          settings: { ...payload.settings, biometricEnabled: false },
          hydrated: true,
          lockState: 'unlocked',
          skippedRecordCount: 0,
        });
      });
    },

    async resetAll() {
      return withVaultLock(async () => {
        await clearEverything();
        zeroKey();
        clearDecryptedState('uninitialised');
      });
    },

    async loadDemoData() {
      requireKey();
      const categories = get().categories.length > 0 ? get().categories : buildDefaultCategories();
      const seeds = generateDemoTxns(categories);
      await get().addTxns(seeds);
      // Sourced from src/personal/plan.ts, same as DEFAULT_SETTINGS above —
      // the demo data is tuned to this exact income/savings/payday (see
      // src/data/demoData.ts), so the settings it implies must match.
      await get().updateSettings({
        monthlyIncomeCents: PLAN_DEFAULTS.monthlyIncomeCents,
        savingsTargetCents: PLAN_DEFAULTS.savingsTargetCents,
        paydayDayOfMonth: PLAN_DEFAULTS.paydayDayOfMonth,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Auto-lock: 2 minutes (configurable via settings.lockTimeoutMs) in the
// background, detected via `visibilitychange`. Mobile browsers can suspend
// JS timers while backgrounded, so this checks elapsed wall-clock time on
// resume as a backup to the timer, not just the timer firing on its own.
// ---------------------------------------------------------------------------

let hiddenAt: number | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const state = useStore.getState();
    if (state.lockState !== 'unlocked') return;
    const timeoutMs = state.settings.lockTimeoutMs || DEFAULT_LOCK_TIMEOUT_MS;

    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (autoLockTimer) clearTimeout(autoLockTimer);
      autoLockTimer = setTimeout(() => {
        useStore.getState().lock();
      }, timeoutMs);
    } else {
      if (autoLockTimer) {
        clearTimeout(autoLockTimer);
        autoLockTimer = null;
      }
      if (hiddenAt !== null) {
        const elapsed = Date.now() - hiddenAt;
        hiddenAt = null;
        if (elapsed >= timeoutMs) {
          useStore.getState().lock();
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Extra helpers beyond the frozen §9 interface — used by the lock screen,
// which needs to know whether biometric is configured WITHOUT decrypting
// anything (the store's decrypted state is empty while locked).
// ---------------------------------------------------------------------------

export async function hasBiometricConfigured(): Promise<boolean> {
  const reg = await getMeta<BiometricRegistration>('biometricReg');
  const wrapped = await getMeta<WrappedKeyBlob>('biometricWrappedKey');
  return Boolean(reg && wrapped);
}

export { isBiometricAvailable };

/**
 * Which unlock mode this vault currently uses, and — for PIN mode — how many
 * digits. Read from the plain `meta` store (not secret, see unlockMode.ts's
 * doc comment) so the lock screen can pick the right input widget (keypad vs.
 * passphrase field) *before* anything is decrypted. Vaults created before
 * this feature existed have no `unlockConfig` record — they default to the
 * historical behaviour: a 6-digit PIN, which is exactly what they already are.
 */
export async function getUnlockConfig(): Promise<UnlockConfig> {
  const config = await getMeta<UnlockConfig>('unlockConfig');
  return config ?? DEFAULT_UNLOCK_CONFIG;
}

/**
 * First-run setup for passphrase mode. Not part of the frozen §9 interface
 * (mirrors `changePin`/`disableBiometric` living outside it) — `setupPin`
 * stays exactly as §9 declares it for PIN mode; this is its passphrase
 * sibling, sharing the same `initializeFreshVault` bootstrap so the two
 * modes can never drift into two different crypto paths.
 */
export async function setupPassphrase(passphrase: string): Promise<void> {
  const { categories, settings } = await initializeFreshVault(passphrase, {
    mode: 'passphrase',
    pinLength: DEFAULT_PIN_LENGTH, // unused in passphrase mode, kept stable
  });
  budgetIndex.clear();
  useStore.setState({
    txns: [],
    categories,
    budgets: [],
    rules: [],
    recurring: [],
    settings,
    hydrated: true,
    lockState: 'unlocked',
    skippedRecordCount: 0,
  });
  // Same as setupPin: a fresh vault arrives already carrying the user's plan.
  await applyPersonalPlan(useStore.getState());
}

/**
 * Turn biometric unlock off. Discards the wrapped-key blob and credential
 * reference (the WebAuthn credential itself is left registered with the
 * platform — there's no way to unregister it from the web, and leaving it
 * doesn't grant access to anything once its wrapped key is gone). Not part
 * of the frozen §9 interface for the same reason `changePin` isn't: it's a
 * pure settings-adjacent operation, not a domain mutation.
 */
export async function disableBiometric(): Promise<void> {
  await deleteMeta('biometricReg');
  await deleteMeta('biometricWrappedKey');
  const state = useStore.getState();
  if (state.lockState === 'unlocked') {
    await state.updateSettings({ biometricEnabled: false });
  }
}

/**
 * Change the unlock secret — a PIN, a passphrase, or a switch between the
 * two — and/or its `UnlockConfig`. Not part of the frozen §9 interface
 * (there's no server-side concept to reconcile — it's a pure key-rotation
 * operation), so it lives as a standalone export rather than a TallyStore
 * method. `changePin`, `switchToPassphrase`, and `switchToPin` below are
 * thin, named wrappers over this — deliberately reusing ONE mechanism for
 * "change my PIN" and "switch to a passphrase" rather than writing a
 * parallel migration path for the latter (deliverable 4).
 *
 * Because the secret-derived key IS the vault's AES-GCM key (not a wrapper
 * around a separate random master key), changing it means a *new* key and
 * therefore re-encrypting every record under it — there is no shortcut. This
 * is intentionally more expensive than a wrapped-key design would be, in
 * exchange for a simpler, more auditable crypto model (see crypto.ts).
 *
 * ATOMICITY / FAIL-SAFETY — read before touching this function:
 * IndexedDB writes below are five independent per-store transactions (see
 * `data/db.ts`'s `putManyEncrypted`/`putEncrypted`, each opening its own
 * `db.transaction(...)`), not one combined cross-store transaction, so this
 * is NOT atomic in the strict sense — an interruption in the narrow window
 * while those transactions are committing could in principle leave some
 * stores re-encrypted under the new key while others are still under the
 * old one. What IS guaranteed, and is the reason this can't brick the vault
 * on the far more common failure modes (tab closed, app backgrounded and
 * killed, network/CPU hiccup, a bug in this function itself):
 *   1. The OLD salt/verifier/config in `meta` — the only thing `unlock()`
 *      ever reads to decide which key is "current" — is left completely
 *      untouched until every single re-encrypted record has been written
 *      AND read back and verified to decrypt correctly under the new key.
 *   2. That verification reads back actual freshly-committed IndexedDB
 *      records (not the in-memory values that were about to be written) for
 *      a sample spanning three different stores — settings (always present),
 *      the first category (always present after setup), and the first
 *      transaction (if any exist) — and decrypts each with the new key
 *      before proceeding.
 *   3. Only after that verification passes does this function flip the
 *      meta salt/verifier/config pointer to the new key — the single
 *      instant at which "the vault's key" changes from the caller's
 *      perspective.
 * So: an interruption before all writes finish leaves the OLD key as the one
 * `unlock()` still expects, and the meta pointer is never flipped, so a
 * failed swap cannot be visible as "correct password, unreadable data" the
 * way a naive "write everything then flip a flag" implementation could be if
 * that flip happened before confirming the writes landed. The residual risk
 * this does NOT close — the multi-transaction, non-atomic bulk write itself
 * — pre-dates this change (the original `changePin` had the same shape) and
 * would need a combined multi-store IndexedDB transaction in `data/db.ts` to
 * fully close; that file is outside this change's ownership boundary.
 *
 * Any existing biometric enrollment wrapped the OLD key, so it's invalidated
 * here and the user needs to re-enable biometric unlock afterwards.
 */
export async function setUnlockSecret(
  currentSecret: string,
  newSecret: string,
  newConfig: UnlockConfig
): Promise<{ ok: boolean; error?: string }> {
  // P0 fix: the whole operation — including taking the snapshot of what to
  // re-encrypt — now runs inside the vault-wide write lock (see
  // vaultLock.ts's doc comment for the bug this closes). Every ordinary
  // mutation (addTxn, updateTxn, ...) acquires this same lock before it
  // writes, so none of them can land under the OLD key in the window between
  // this function's snapshot and its meta-pointer flip below — they simply
  // queue and run, correctly, under the NEW key once this finishes.
  return withVaultLock(async () => {
    const saltB64 = await getMeta<string>('salt');
    const verifierBlob = await getMeta<EncryptedBlob>('verifier');
    if (!saltB64 || !verifierBlob) return { ok: false, error: 'Vault is not set up yet.' };

    const oldKey = await deriveKey(currentSecret, base64ToBuf(saltB64));
    const currentOk = await checkVerifier(oldKey, verifierBlob);
    if (!currentOk) return { ok: false, error: 'Your current PIN or passphrase is incorrect.' };

    const state = useStore.getState();
    if (state.lockState !== 'unlocked' || !state.hydrated) {
      return { ok: false, error: 'Unlock Tally before changing how it unlocks.' };
    }

    const newSalt = generateSalt();
    const newKey = await deriveKey(newSecret, newSalt);
    const newVerifier = await makeVerifier(newKey);

    const budgetRecords: { id: string; value: Budget }[] = [];
    for (const [mapKey, id] of budgetIndex.entries()) {
      const sep = mapKey.indexOf('::');
      const categoryId = mapKey.slice(0, sep);
      const month = mapKey.slice(sep + 2);
      const budget = state.budgets.find((b) => b.categoryId === categoryId && b.month === month);
      if (budget) budgetRecords.push({ id, value: budget });
    }

    // Re-encrypt every record under the new key. `meta` (salt/verifier/config)
    // is deliberately NOT touched yet — see the fail-safety note above.
    await Promise.all([
      encryptAndPutMany(
        'txns',
        newKey,
        state.txns.map((t) => ({ id: t.id, value: t }))
      ),
      encryptAndPutMany(
        'categories',
        newKey,
        state.categories.map((c) => ({ id: c.id, value: c }))
      ),
      encryptAndPutMany('budgets', newKey, budgetRecords),
      encryptAndPutMany(
        'rules',
        newKey,
        state.rules.map((r) => ({ id: r.id, value: r }))
      ),
      encryptAndPutMany(
        'recurring',
        newKey,
        state.recurring.map((r) => ({ id: r.id, value: r }))
      ),
      encryptAndPut('settings', newKey, SETTINGS_ID, { ...state.settings, biometricEnabled: false }),
    ]);

    // Fail-safe verification: read back what was ACTUALLY committed (not the
    // in-memory values used to write it) from three different stores and
    // confirm the new key genuinely decrypts them, before the meta pointer
    // that `unlock()` trusts is allowed to move.
    const verified = await verifyKeyReadsBack(newKey, {
      settingsId: SETTINGS_ID,
      categoryId: state.categories[0]?.id,
      txnId: state.txns[0]?.id,
    });
    if (!verified) {
      return {
        ok: false,
        error: 'Could not verify the re-encrypted vault. Nothing about how you unlock has changed — try again.',
      };
    }

    await setMeta('salt', bufToBase64(newSalt));
    await setMeta('verifier', newVerifier);
    await setMeta('unlockConfig', newConfig);
    // The old biometric wrap targeted a key that no longer exists as the active vault key.
    await deleteMeta('biometricReg');
    await deleteMeta('biometricWrappedKey');

    setActiveKey(newKey);
    useStore.setState({ settings: { ...state.settings, biometricEnabled: false } });

    return { ok: true };
  });
}

/**
 * Fail-safe verification shared by `setUnlockSecret` (PIN/passphrase
 * rotation) and `importBackup` (restore): read back what was ACTUALLY
 * committed to IndexedDB (not the in-memory values that were about to be
 * written) for a small sample spanning three stores, and confirm `key`
 * genuinely decrypts each one, before the caller is allowed to flip the
 * `meta` pointer `unlock()` trusts. Settings is always present after setup;
 * category/txn ids are optional since a fresh vault may have no transactions
 * yet (and, in principle, could be mid-first-category-creation).
 */
async function verifyKeyReadsBack(
  key: CryptoKey,
  sample: { settingsId: string; categoryId?: string; txnId?: string }
): Promise<boolean> {
  try {
    const [settingsRecords, categoryRecords, txnRecords] = await Promise.all([
      getAllEncrypted('settings'),
      sample.categoryId ? getAllEncrypted('categories') : Promise.resolve([]),
      sample.txnId ? getAllEncrypted('txns') : Promise.resolve([]),
    ]);

    const settingsRecord = settingsRecords.find((r) => r.id === sample.settingsId);
    if (!settingsRecord) return false;
    await decryptJSON(key, settingsRecord.blob);

    if (sample.categoryId) {
      const rec = categoryRecords.find((r) => r.id === sample.categoryId);
      if (!rec) return false;
      await decryptJSON(key, rec.blob);
    }

    if (sample.txnId) {
      const rec = txnRecords.find((r) => r.id === sample.txnId);
      if (!rec) return false;
      await decryptJSON(key, rec.blob);
    }

    return true;
  } catch {
    // AES-GCM auth failure or malformed JSON — the sample did not decrypt
    // cleanly under the new key. Treated as a failed migration/restore.
    return false;
  }
}

/** Change the PIN, keeping (or changing) its length. Same-mode convenience wrapper over `setUnlockSecret`. */
export async function changePin(
  currentPin: string,
  newPin: string
): Promise<{ ok: boolean; error?: string }> {
  return setUnlockSecret(currentPin, newPin, { mode: 'pin', pinLength: newPin.length });
}

/**
 * Migration: switch an existing PIN (or passphrase) vault to passphrase mode.
 * Reuses `setUnlockSecret`/`changePin`'s re-encrypt-and-verify mechanism —
 * deliverable 4 explicitly calls for reusing this rather than a parallel
 * migration path, since the PIN/passphrase-derived key IS the vault key.
 */
export async function switchToPassphrase(
  currentSecret: string,
  newPassphrase: string
): Promise<{ ok: boolean; error?: string }> {
  return setUnlockSecret(currentSecret, newPassphrase, {
    mode: 'passphrase',
    pinLength: DEFAULT_PIN_LENGTH,
  });
}

/** The reverse of `switchToPassphrase` — back to a numeric PIN. */
export async function switchToPin(
  currentSecret: string,
  newPin: string
): Promise<{ ok: boolean; error?: string }> {
  return setUnlockSecret(currentSecret, newPin, { mode: 'pin', pinLength: newPin.length });
}
