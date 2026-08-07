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
  getMeta,
  setMeta,
  deleteMeta,
  getAllEncrypted,
  putEncrypted,
  putManyEncrypted,
  deleteRecord,
  clearEverything,
  type DataStoreName,
} from '@/data/db';
import { buildDefaultCategories, DEFAULT_PINNED_CATEGORY_IDS } from '@/data/defaultCategories';
import { generateDemoTxns } from '@/data/demoData';
import { hashTxn } from '@/data/dedupe';
import {
  TALLY_BACKUP_FORMAT,
  TALLY_BACKUP_VERSION,
  type BackupPayload,
  type TallyBackupFile,
} from '@/data/backup';

const SETTINGS_ID = 'settings';
const DEFAULT_LOCK_TIMEOUT_MS = 120_000; // 2 minutes, CONTRACTS.md §5

const DEFAULT_SETTINGS: Settings = {
  currency: 'AUD',
  locale: 'en-AU',
  paydayDayOfMonth: 15,
  monthlyIncomeCents: 0,
  savingsTargetCents: 0,
  lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
  biometricEnabled: false,
  pinnedCategoryIds: [...DEFAULT_PINNED_CATEGORY_IDS],
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

async function decryptAllWithIds<T>(
  storeName: DataStoreName,
  key: CryptoKey
): Promise<{ id: string; value: T }[]> {
  const records = await getAllEncrypted(storeName);
  return Promise.all(records.map(async (r) => ({ id: r.id, value: await decryptJSON<T>(key, r.blob) })));
}

async function decryptAll<T>(storeName: DataStoreName, key: CryptoKey): Promise<T[]> {
  const withIds = await decryptAllWithIds<T>(storeName, key);
  return withIds.map((r) => r.value);
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

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const useStore = create<TallyStore>((set, get) => {
  // Determine uninitialised vs locked as soon as possible after first render.
  // Always starts as 'locked' optimistically to avoid a first-run flash; if
  // no salt exists yet this flips to 'uninitialised' a tick later.
  void (async () => {
    const salt = await getMeta<string>('salt');
    set({ lockState: salt ? 'locked' : 'uninitialised' });
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

    budgetIndex.clear();
    for (const rec of budgetRecords) {
      budgetIndex.set(budgetMapKey(rec.value.categoryId, rec.value.month), rec.id);
    }

    set({
      txns: sortTxns(txns),
      categories: sortCategories(categories),
      budgets: budgetRecords.map((r) => r.value),
      rules,
      recurring,
      settings: settingsArr[0] ?? DEFAULT_SETTINGS,
      hydrated: true,
      lockState: 'unlocked',
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

    // --- lock lifecycle -----------------------------------------------

    async setupPin(pin) {
      const salt = generateSalt();
      const key = await deriveKey(pin, salt);
      const verifier = await makeVerifier(key);
      await setMeta('salt', bufToBase64(salt));
      await setMeta('verifier', verifier);
      setActiveKey(key);

      const categories = buildDefaultCategories();
      const settings: Settings = { ...DEFAULT_SETTINGS };

      await encryptAndPutMany(
        'categories',
        key,
        categories.map((c) => ({ id: c.id, value: c }))
      );
      await encryptAndPut('settings', key, SETTINGS_ID, settings);

      budgetIndex.clear();
      set({
        txns: [],
        categories: sortCategories(categories),
        budgets: [],
        rules: [],
        recurring: [],
        settings,
        hydrated: true,
        lockState: 'unlocked',
      });
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

    async addTxn(t) {
      const key = requireKey();
      const hash = await hashTxn(t.date, t.amountCents, t.description, t.account);
      const now = Date.now();
      const txn: Txn = { ...t, id: crypto.randomUUID(), hash, createdAt: now, updatedAt: now };
      await encryptAndPut('txns', key, txn.id, txn);
      set((state) => ({ txns: sortTxns([...state.txns, txn]) }));
      return txn;
    },

    async addTxns(ts) {
      const key = requireKey();
      const existingHashes = new Set(get().txns.map((t) => t.hash));
      const now = Date.now();
      const toInsert: Txn[] = [];
      let skipped = 0;

      for (const t of ts) {
        // The frozen §9 type still carries `hash` on this input (it's only
        // omitted on the singular addTxn), but the hash MUST be authoritative
        // dedupe data, not whatever the caller happened to pass — so it is
        // always recomputed here and the incoming value is ignored.
        const hash = await hashTxn(t.date, t.amountCents, t.description, t.account);
        if (existingHashes.has(hash)) {
          skipped++;
          continue;
        }
        existingHashes.add(hash);
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
    },

    async updateTxn(id, patch) {
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
    },

    async deleteTxn(id) {
      requireKey();
      await deleteRecord('txns', id);
      set((state) => ({ txns: state.txns.filter((t) => t.id !== id) }));
    },

    async setBudget(categoryId, month, limitCents) {
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
    },

    async addCategory(c) {
      const key = requireKey();
      const category: Category = { ...c, id: crypto.randomUUID() };
      await encryptAndPut('categories', key, category.id, category);
      set((state) => ({ categories: sortCategories([...state.categories, category]) }));
      return category;
    },

    async updateCategory(id, patch) {
      const key = requireKey();
      const current = get().categories.find((c) => c.id === id);
      if (!current) return;
      const updated: Category = { ...current, ...patch, id };
      await encryptAndPut('categories', key, id, updated);
      set((state) => ({
        categories: sortCategories(state.categories.map((c) => (c.id === id ? updated : c))),
      }));
    },

    async deleteCategory(id) {
      requireKey();
      const current = get().categories.find((c) => c.id === id);
      if (!current) return;
      if (current.builtin) {
        throw new Error('Built-in categories cannot be deleted.');
      }
      await deleteRecord('categories', id);
      set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }));
    },

    async addRule(match, categoryId) {
      const key = requireKey();
      const rule: Rule = {
        id: crypto.randomUUID(),
        match: match.trim().toLowerCase(),
        categoryId,
        createdAt: Date.now(),
      };
      await encryptAndPut('rules', key, rule.id, rule);
      set((state) => ({ rules: [...state.rules, rule] }));
    },

    async setRecurring(series) {
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
    },

    async updateSettings(patch) {
      const key = requireKey();
      const updated: Settings = { ...get().settings, ...patch };
      await encryptAndPut('settings', key, SETTINGS_ID, updated);
      set({ settings: updated });
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

    async importBackup(file, pin) {
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

      // Full restore: this device's local vault becomes an exact copy of the
      // backup's. A WebAuthn credential is device-specific and cannot be
      // carried over, so biometric unlock is disabled and must be re-enabled.
      await clearEverything();
      await setMeta('salt', parsed.saltB64);
      await setMeta('verifier', parsed.verifier);
      setActiveKey(key);

      budgetIndex.clear();
      const budgetsWithIds = payload.budgets.map((b) => ({ id: crypto.randomUUID(), value: b }));
      for (const rec of budgetsWithIds) {
        budgetIndex.set(budgetMapKey(rec.value.categoryId, rec.value.month), rec.id);
      }

      await Promise.all([
        encryptAndPutMany(
          'txns',
          key,
          payload.txns.map((t) => ({ id: t.id, value: t }))
        ),
        encryptAndPutMany(
          'categories',
          key,
          payload.categories.map((c) => ({ id: c.id, value: c }))
        ),
        encryptAndPutMany('budgets', key, budgetsWithIds),
        encryptAndPutMany(
          'rules',
          key,
          payload.rules.map((r) => ({ id: r.id, value: r }))
        ),
        encryptAndPutMany(
          'recurring',
          key,
          payload.recurring.map((r) => ({ id: r.id, value: r }))
        ),
        encryptAndPut('settings', key, SETTINGS_ID, { ...payload.settings, biometricEnabled: false }),
      ]);

      set({
        txns: sortTxns(payload.txns),
        categories: sortCategories(payload.categories),
        budgets: payload.budgets,
        rules: payload.rules,
        recurring: payload.recurring,
        settings: { ...payload.settings, biometricEnabled: false },
        hydrated: true,
        lockState: 'unlocked',
      });
    },

    async resetAll() {
      await clearEverything();
      zeroKey();
      clearDecryptedState('uninitialised');
    },

    async loadDemoData() {
      requireKey();
      const categories = get().categories.length > 0 ? get().categories : buildDefaultCategories();
      const seeds = generateDemoTxns(categories);
      await get().addTxns(seeds);
      await get().updateSettings({
        monthlyIncomeCents: 620_000,
        savingsTargetCents: 40_000,
        paydayDayOfMonth: 15,
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
 * Change the PIN. Not part of the frozen §9 interface (there's no server-side
 * concept to reconcile — it's a pure key-rotation operation), so it lives as
 * a standalone export rather than a TallyStore method.
 *
 * Because the PIN-derived key IS the vault's AES-GCM key (not a wrapper
 * around a separate random master key), changing the PIN means a *new* key
 * and therefore re-encrypting every record under it — there is no shortcut.
 * This is intentionally more expensive than a wrapped-key design would be,
 * in exchange for a simpler, more auditable crypto model (see crypto.ts).
 *
 * Any existing biometric enrollment wrapped the OLD key, so it's invalidated
 * here and the user needs to re-enable biometric unlock afterwards.
 */
export async function changePin(
  currentPin: string,
  newPin: string
): Promise<{ ok: boolean; error?: string }> {
  const saltB64 = await getMeta<string>('salt');
  const verifierBlob = await getMeta<EncryptedBlob>('verifier');
  if (!saltB64 || !verifierBlob) return { ok: false, error: 'Vault is not set up yet.' };

  const oldKey = await deriveKey(currentPin, base64ToBuf(saltB64));
  const currentOk = await checkVerifier(oldKey, verifierBlob);
  if (!currentOk) return { ok: false, error: 'Current PIN is incorrect.' };

  const state = useStore.getState();
  if (state.lockState !== 'unlocked' || !state.hydrated) {
    return { ok: false, error: 'Unlock Tally before changing your PIN.' };
  }

  const newSalt = generateSalt();
  const newKey = await deriveKey(newPin, newSalt);
  const newVerifier = await makeVerifier(newKey);

  const budgetRecords: { id: string; value: Budget }[] = [];
  for (const [mapKey, id] of budgetIndex.entries()) {
    const sep = mapKey.indexOf('::');
    const categoryId = mapKey.slice(0, sep);
    const month = mapKey.slice(sep + 2);
    const budget = state.budgets.find((b) => b.categoryId === categoryId && b.month === month);
    if (budget) budgetRecords.push({ id, value: budget });
  }

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

  await setMeta('salt', bufToBase64(newSalt));
  await setMeta('verifier', newVerifier);
  // The old biometric wrap targeted a key that no longer exists as the active vault key.
  await deleteMeta('biometricReg');
  await deleteMeta('biometricWrappedKey');

  setActiveKey(newKey);
  useStore.setState({ settings: { ...state.settings, biometricEnabled: false } });

  return { ok: true };
}
