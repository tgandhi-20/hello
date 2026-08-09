package com.tally.app.data

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.tally.app.security.AutoLockPolicy
import com.tally.app.security.BiometricVaultUnlock
import com.tally.app.security.KeystoreVaultKeyWrapper
import com.tally.app.security.LockoutPolicy
import com.tally.app.security.LockoutState
import com.tally.app.security.LockoutStore
import com.tally.app.security.UnlockConfig
import com.tally.app.security.VaultCrypto
import com.tally.app.security.VaultKeyHolder
import com.tally.app.security.VaultLock
import com.tally.app.util.Json
import com.tally.app.util.JsonValue
import com.tally.app.util.getString
import com.tally.app.util.jsonObject
import com.tally.app.util.stringify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.Executor
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

/**
 * Tally — the single entry point other agents' code should use for anything
 * that touches the vault (deliverables 2-5 tied together). Analogous to
 * useStore.ts, but deliberately narrower in scope: this module owns
 * security/** and data/** only, not ui/**, so it exposes plain
 * suspend-function operations rather than a UI-observable store — the
 * ui/** agent wraps this in whatever ViewModel/state-holder shape it wants.
 *
 * SCOPE NOTE: this intentionally does not reproduce every piece of business
 * logic useStore.ts has (e.g. reassigning transactions when a category with
 * dependents is deleted, or diffing/reconciling recurring-series lists) —
 * that is product logic that belongs with whichever agent owns the feature
 * built on top of storage, not with the storage layer itself. What's here
 * is a complete, correct, encrypted CRUD surface over every store in
 * src/types.ts, full setup/unlock/lock/biometric lifecycle, and a
 * byte-compatible `.tally` backup path — see the top-level task report for
 * exactly what was and wasn't carried over.
 */
class VaultRepository private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val dao = TallyDatabase.get(appContext).dao()
    private val lockoutStore = LockoutStore(appContext)

    /** Wire this into the hosting Activity's lifecycle — see AutoLockPolicy's doc comment. */
    val autoLock = AutoLockPolicy(onLock = { lock() })

    // ---- meta keys (mirrors src/data/db.ts's `meta` store key names) ----
    private object MetaKeys {
        const val SALT = "salt"
        const val VERIFIER = "verifier"
        const val UNLOCK_CONFIG = "unlockConfig"
        const val BIOMETRIC_WRAPPED = "biometricWrappedKey"
    }

    // ---------------------------------------------------------------------
    // Setup / lock-state queries
    // ---------------------------------------------------------------------

    suspend fun isSetUp(): Boolean = dao.getMeta(MetaKeys.SALT) != null

    suspend fun getUnlockConfig(): UnlockConfig {
        val rec = dao.getMeta(MetaKeys.UNLOCK_CONFIG) ?: return UnlockConfig.DEFAULT
        return try {
            UnlockConfig.fromJson(Json.parse(rec.valueJson) as JsonValue.Obj)
        } catch (e: Exception) {
            UnlockConfig.DEFAULT
        }
    }

    suspend fun hasBiometricConfigured(): Boolean =
        dao.getMeta(MetaKeys.BIOMETRIC_WRAPPED) != null && KeystoreVaultKeyWrapper.hasKey()

    fun currentLockoutState(): LockoutState = lockoutStore.read()

    fun isUnlocked(): Boolean = VaultKeyHolder.isUnlocked()

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    suspend fun setupPin(pin: String): Unit =
        setup(pin, UnlockConfig(mode = UnlockConfig.MODE_PIN, pinLength = pin.length))

    suspend fun setupPassphrase(passphrase: String): Unit =
        setup(passphrase, UnlockConfig(mode = UnlockConfig.MODE_PASSPHRASE, pinLength = com.tally.app.security.DEFAULT_PIN_LENGTH))

    private suspend fun setup(secret: String, config: UnlockConfig) = VaultLock.withLock {
        val salt = VaultCrypto.generateSalt()
        val key = VaultCrypto.deriveKey(secret, salt)
        val verifier = VaultCrypto.makeVerifier(key)

        dao.putMeta(MetaRecord(MetaKeys.SALT, VaultCrypto.b64(salt)))
        dao.putMeta(MetaRecord(MetaKeys.VERIFIER, blobToJsonString(verifier)))
        dao.putMeta(MetaRecord(MetaKeys.UNLOCK_CONFIG, config.toJson().stringify()))

        // Seed default single settings row so getAllSettings() always has exactly one row post-setup.
        dao.putSettings(encryptSettings(key, DEFAULT_SETTINGS))

        VaultKeyHolder.set(key)
        lockoutStore.write(LockoutPolicy.onSuccess())
    }

    // ---------------------------------------------------------------------
    // Unlock / lock
    // ---------------------------------------------------------------------

    sealed class UnlockResult {
        object Ok : UnlockResult()
        object WrongSecret : UnlockResult()
        object NotSetUp : UnlockResult()
        /** Biometric hardware/enrollment unavailable, or the user cancelled — always fall back to PIN, never an error. */
        object BiometricUnavailable : UnlockResult()
        data class LockedOut(val remainingMs: Long) : UnlockResult()
    }

    suspend fun unlock(secret: String): UnlockResult {
        val now = System.currentTimeMillis()
        val lockoutState = lockoutStore.read()
        if (LockoutPolicy.isLocked(lockoutState, now)) {
            return UnlockResult.LockedOut(LockoutPolicy.remainingLockMillis(lockoutState, now))
        }

        val saltRec = dao.getMeta(MetaKeys.SALT) ?: return UnlockResult.NotSetUp
        val verifierRec = dao.getMeta(MetaKeys.VERIFIER) ?: return UnlockResult.NotSetUp

        val salt = VaultCrypto.unb64(saltRec.valueJson)
        val verifierBlob = jsonStringToBlob(verifierRec.valueJson)

        val key = VaultCrypto.deriveKey(secret, salt)
        val ok = VaultCrypto.checkVerifier(key, verifierBlob)
        if (!ok) {
            lockoutStore.write(LockoutPolicy.onFailure(lockoutState, now))
            return UnlockResult.WrongSecret
        }

        lockoutStore.write(LockoutPolicy.onSuccess())
        VaultKeyHolder.set(key)
        return UnlockResult.Ok
    }

    /** Zeroes the in-memory key. Called on explicit lock, auto-lock timeout, and should also be a no-op-safe call on process restart (there's nothing to clear — see VaultKeyHolder's doc comment). */
    fun lock() {
        VaultKeyHolder.clear()
    }

    // ---------------------------------------------------------------------
    // Biometric enrollment / unlock
    // ---------------------------------------------------------------------

    /**
     * Wrap the CURRENTLY ACTIVE vault key behind the Keystore + biometric
     * gate. Must be called while unlocked. Returns false on ANY failure —
     * never throws, never leaves biometric half-configured.
     */
    suspend fun enableBiometric(activity: FragmentActivity, executor: Executor): Boolean {
        val key = VaultKeyHolder.get() ?: return false
        val rawKeyBytes = key.encoded ?: return false
        val wrapResult = BiometricVaultUnlock.wrapVaultKey(
            activity,
            executor,
            rawKeyBytes,
            title = "Unlock Tally",
            subtitle = "Confirm your fingerprint to enable quick unlock",
        ) ?: return false

        val (wrapped, iv) = wrapResult
        val obj = jsonObject {
            put("wrapped", VaultCrypto.b64(wrapped))
            put("iv", VaultCrypto.b64(iv))
        }
        dao.putMeta(MetaRecord(MetaKeys.BIOMETRIC_WRAPPED, obj.stringify()))
        return true
    }

    suspend fun disableBiometric() {
        dao.deleteMeta(MetaKeys.BIOMETRIC_WRAPPED)
        KeystoreVaultKeyWrapper.deleteKey()
    }

    suspend fun unlockBiometric(activity: FragmentActivity, executor: Executor): UnlockResult {
        val now = System.currentTimeMillis()
        val lockoutState = lockoutStore.read()
        if (LockoutPolicy.isLocked(lockoutState, now)) {
            return UnlockResult.LockedOut(LockoutPolicy.remainingLockMillis(lockoutState, now))
        }

        val wrappedRec = dao.getMeta(MetaKeys.BIOMETRIC_WRAPPED) ?: return UnlockResult.BiometricUnavailable
        val verifierRec = dao.getMeta(MetaKeys.VERIFIER) ?: return UnlockResult.NotSetUp

        val obj = try {
            Json.parse(wrappedRec.valueJson) as JsonValue.Obj
        } catch (e: Exception) {
            return UnlockResult.BiometricUnavailable
        }
        val wrapped = try {
            VaultCrypto.unb64(obj.getString("wrapped"))
        } catch (e: Exception) {
            return UnlockResult.BiometricUnavailable
        }
        val iv = try {
            VaultCrypto.unb64(obj.getString("iv"))
        } catch (e: Exception) {
            return UnlockResult.BiometricUnavailable
        }

        val keyBytes = BiometricVaultUnlock.unwrapVaultKey(
            activity,
            executor,
            wrapped,
            iv,
            title = "Unlock Tally",
            subtitle = "Confirm your fingerprint",
        ) ?: return UnlockResult.BiometricUnavailable

        val key = SecretKeySpec(keyBytes, "AES")
        val verifierBlob = jsonStringToBlob(verifierRec.valueJson)
        if (!VaultCrypto.checkVerifier(key, verifierBlob)) {
            // Should not happen (the wrap only ever wraps a verified key), but
            // never trust that invariant blindly — fall back cleanly either way.
            return UnlockResult.BiometricUnavailable
        }

        VaultKeyHolder.set(key)
        lockoutStore.write(LockoutPolicy.onSuccess())
        return UnlockResult.Ok
    }

    // ---------------------------------------------------------------------
    // Hydrate — resilient decrypt of every store (deliverable 5's
    // Promise.allSettled equivalent; see DecryptBatch.kt)
    // ---------------------------------------------------------------------

    data class HydrateResult(
        val txns: List<Txn>,
        val categories: List<Category>,
        /** id (Room primary key) + value — Budget has no `id` field of its own, mirrors useStore.ts's budgetIndex. */
        val budgets: List<Pair<String, Budget>>,
        val rules: List<Rule>,
        val recurring: List<RecurringSeries>,
        val settings: Settings,
        val skippedRecordCount: Int,
    )

    suspend fun hydrateAll(): HydrateResult = withContext(Dispatchers.Default) {
        val key = VaultKeyHolder.get() ?: throw IllegalStateException("Tally is locked.")

        val txnsD = async { decryptAll(dao.getAllTxns(), key, ::txnFromJson) }
        val categoriesD = async { decryptAll(dao.getAllCategories(), key, ::categoryFromJson) }
        val budgetsD = async { decryptAllWithIds(dao.getAllBudgets(), key, ::budgetFromJson) }
        val rulesD = async { decryptAll(dao.getAllRules(), key, ::ruleFromJson) }
        val recurringD = async { decryptAll(dao.getAllRecurring(), key, ::recurringFromJson) }
        val settingsD = async { decryptAll(dao.getAllSettings(), key, ::settingsFromJson) }

        // Awaited individually rather than via awaitAll (a heterogeneous list
        // of Deferred<T> with different T per entry isn't directly usable
        // with it) — each one still runs concurrently, since they were all
        // started above before any await.
        val txns = txnsD.await()
        val categories = categoriesD.await()
        val budgets = budgetsD.await()
        val rules = rulesD.await()
        val recurring = recurringD.await()
        val settings = settingsD.await()

        val skipped = txns.skipped + categories.skipped + budgets.skipped + rules.skipped + recurring.skipped + settings.skipped

        HydrateResult(
            txns = txns.items,
            categories = categories.items,
            budgets = budgets.items,
            rules = rules.items,
            recurring = recurring.items,
            settings = settings.items.firstOrNull() ?: DEFAULT_SETTINGS,
            skippedRecordCount = skipped,
        )
    }

    // ---------------------------------------------------------------------
    // Mutations — every write acquires VaultLock (P0 fix, see VaultLock.kt)
    // ---------------------------------------------------------------------

    private fun requireKey(): SecretKey =
        VaultKeyHolder.get() ?: throw IllegalStateException("Tally is locked.")

    suspend fun addTxn(
        date: String,
        amountCents: Long,
        description: String,
        merchant: String,
        categoryId: String,
        account: String,
        source: String,
        note: String? = null,
    ): Txn = VaultLock.withLock {
        val key = requireKey()
        val now = System.currentTimeMillis()
        val hash = Dedupe.hashTxn(date, amountCents, description, account)
        val txn = Txn(
            id = UUID.randomUUID().toString(),
            date = date,
            amountCents = amountCents,
            description = description,
            merchant = merchant,
            categoryId = categoryId,
            account = account,
            source = source,
            hash = hash,
            note = note,
            createdAt = now,
            updatedAt = now,
        )
        dao.putTxn(encryptTxn(key, txn))
        txn
    }

    /** Bulk insert (e.g. CSV import), deduping against `existingHashes`. Mirrors useStore.ts's `addTxns`. */
    suspend fun addTxns(candidates: List<Txn>, existingHashes: Set<String>): Pair<List<Txn>, Int> = VaultLock.withLock {
        val key = requireKey()
        val now = System.currentTimeMillis()
        val occurrenceCounts = HashMap<String, Int>()
        val toInsert = ArrayList<Txn>()
        var skipped = 0

        for (t in candidates) {
            val groupKey = Dedupe.groupKey(t.date, t.amountCents, t.description, t.account)
            val occurrence = occurrenceCounts.getOrDefault(groupKey, 0)
            occurrenceCounts[groupKey] = occurrence + 1
            val hash = Dedupe.hashTxn(t.date, t.amountCents, t.description, t.account, occurrence)
            if (existingHashes.contains(hash)) {
                skipped++
                continue
            }
            toInsert.add(t.copy(id = UUID.randomUUID().toString(), hash = hash, createdAt = now, updatedAt = now))
        }

        if (toInsert.isNotEmpty()) {
            dao.putTxns(toInsert.map { encryptTxn(key, it) })
        }
        toInsert to skipped
    }

    suspend fun updateTxn(existing: Txn, patchApply: (Txn) -> Txn): Txn = VaultLock.withLock {
        val key = requireKey()
        val merged = patchApply(existing).copy(id = existing.id, updatedAt = System.currentTimeMillis())
        dao.putTxn(encryptTxn(key, merged))
        merged
    }

    suspend fun deleteTxn(id: String): Unit = VaultLock.withLock {
        requireKey()
        dao.deleteTxn(id)
    }

    suspend fun addCategory(category: Category): Category = VaultLock.withLock {
        val key = requireKey()
        dao.putCategory(encryptCategory(key, category))
        category
    }

    suspend fun updateCategory(category: Category): Unit = VaultLock.withLock {
        val key = requireKey()
        dao.putCategory(encryptCategory(key, category))
    }

    /**
     * Delete a category, reassigning any of its transactions to
     * `fallbackCategoryId` and dropping its budget rows — a smaller,
     * self-contained version of useStore.ts's `deleteCategory` (no
     * builtin-category guard or streak/insight side effects; those are
     * product logic for whichever agent builds the category-management UI).
     */
    suspend fun deleteCategory(id: String, fallbackCategoryId: String): Unit = VaultLock.withLock {
        val key = requireKey()
        val txnRecords = dao.getAllTxns()
        val budgetRecords = decryptAllWithIds(dao.getAllBudgets(), key, ::budgetFromJson)

        val reassigned = ArrayList<TxnRecord>()
        for (rec in txnRecords) {
            val json = VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(rec.iv, rec.ct))
            val txn = try {
                txnFromJson(Json.parse(json) as JsonValue.Obj)
            } catch (e: Exception) {
                continue // resilient: an unreadable row is simply left alone
            }
            if (txn.categoryId == id) {
                reassigned.add(encryptTxn(key, txn.copy(categoryId = fallbackCategoryId, updatedAt = System.currentTimeMillis())))
            }
        }
        if (reassigned.isNotEmpty()) dao.putTxns(reassigned)

        for ((budgetId, budget) in budgetRecords.items) {
            if (budget.categoryId == id) dao.deleteBudget(budgetId)
        }

        dao.deleteCategory(id)
    }

    suspend fun setBudget(id: String?, budget: Budget): String = VaultLock.withLock {
        val key = requireKey()
        val recordId = id ?: UUID.randomUUID().toString()
        val blob = encryptJsonObj(key, budget.toJson())
        dao.putBudget(BudgetRecord(recordId, blob.iv, blob.ct))
        recordId
    }

    suspend fun deleteBudget(id: String): Unit = VaultLock.withLock {
        requireKey()
        dao.deleteBudget(id)
    }

    suspend fun addRule(match: String, categoryId: String): Rule = VaultLock.withLock {
        val key = requireKey()
        val rule = Rule(id = UUID.randomUUID().toString(), match = match.trim().lowercase(), categoryId = categoryId, createdAt = System.currentTimeMillis())
        val blob = encryptJsonObj(key, rule.toJson())
        dao.putRule(RuleRecord(rule.id, blob.iv, blob.ct))
        rule
    }

    suspend fun deleteRule(id: String): Unit = VaultLock.withLock {
        requireKey()
        dao.deleteRule(id)
    }

    /** Replaces the whole recurring-series list, mirroring useStore.ts's `setRecurring` diff-and-replace. */
    suspend fun setRecurring(series: List<RecurringSeries>): Unit = VaultLock.withLock {
        val key = requireKey()
        val existingIds = dao.getAllRecurring().map { it.id }.toSet()
        val nextIds = series.map { it.id }.toSet()
        for (staleId in existingIds - nextIds) dao.deleteRecurring(staleId)
        if (series.isNotEmpty()) {
            dao.putRecurringMany(
                series.map {
                    val blob = encryptJsonObj(key, it.toJson())
                    RecurringRecord(it.id, blob.iv, blob.ct)
                },
            )
        }
    }

    suspend fun updateSettings(patch: (Settings) -> Settings): Settings = VaultLock.withLock {
        val key = requireKey()
        val current = dao.getAllSettings().firstOrNull()?.let {
            settingsFromJson(Json.parse(VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(it.iv, it.ct))) as JsonValue.Obj)
        } ?: DEFAULT_SETTINGS
        val updated = patch(current)
        dao.putSettings(encryptSettings(key, updated))
        updated
    }

    // ---------------------------------------------------------------------
    // Backup export / import (deliverable 3)
    // ---------------------------------------------------------------------

    suspend fun exportBackup(): ByteArray {
        val key = requireKey()
        val saltRec = dao.getMeta(MetaKeys.SALT) ?: throw IllegalStateException("Vault not initialised.")
        val verifierRec = dao.getMeta(MetaKeys.VERIFIER) ?: throw IllegalStateException("Vault not initialised.")
        val verifierBlob = jsonStringToBlob(verifierRec.valueJson)

        val state = hydrateAll()
        val payload = Backup.Payload(
            txns = state.txns,
            categories = state.categories,
            budgets = state.budgets.map { it.second },
            rules = state.rules,
            recurring = state.recurring,
            settings = state.settings,
        )
        return Backup.buildFile(key, saltRec.valueJson, verifierBlob, payload, System.currentTimeMillis())
    }

    /**
     * Restore a `.tally` backup, replacing this device's entire vault.
     *
     * ORDERING (mirrors useStore.ts's `importBackup` fail-safety exactly —
     * see Backup.kt's class doc comment for the P0 this preserves):
     *  1. `Backup.readAndValidate` fully decrypts and validates the payload
     *     IN MEMORY. Any failure here throws with the on-disk vault
     *     completely untouched.
     *  2. Every record is re-encrypted under the backup's own key, still
     *     entirely in memory.
     *  3. ONLY THEN are the financial tables cleared (never `meta` — the
     *     salt/verifier `unlock()` trusts stays untouched until the very
     *     end) and the new rows written.
     *  4. A sample of what was ACTUALLY committed is read back and
     *     decrypted to confirm the restore really landed before...
     *  5. ...`meta`'s salt/verifier are finally flipped to the backup's own
     *     — the single instant "the vault's key" changes from the caller's
     *     perspective.
     * An interruption between (3) and (5) leaves an empty vault still under
     * the OLD key (recoverable by re-running the import) rather than `meta`
     * claiming a key that doesn't match what's on disk.
     */
    suspend fun importBackup(fileBytes: ByteArray, secret: String): HydrateResult = VaultLock.withLock {
        val result = Backup.readAndValidate(fileBytes, secret)
        val key = result.key
        val payload = result.payload

        val txnRecords = payload.txns.map { encryptTxn(key, it) }
        val categoryRecords = payload.categories.map { encryptCategory(key, it) }
        val budgetsWithIds = payload.budgets.map { UUID.randomUUID().toString() to it }
        val budgetRecords = budgetsWithIds.map { (id, b) ->
            val blob = encryptJsonObj(key, b.toJson())
            BudgetRecord(id, blob.iv, blob.ct)
        }
        val ruleRecords = payload.rules.map {
            val blob = encryptJsonObj(key, it.toJson())
            RuleRecord(it.id, blob.iv, blob.ct)
        }
        val recurringRecords = payload.recurring.map {
            val blob = encryptJsonObj(key, it.toJson())
            RecurringRecord(it.id, blob.iv, blob.ct)
        }
        // Biometric enrollment is device-specific and cannot travel in a backup — always disabled on restore.
        val settingsForRestore = payload.settings.copy(biometricEnabled = false)
        val settingsRecord = encryptSettings(key, settingsForRestore)

        // Only the financial tables are cleared — meta (salt/verifier/unlockConfig) is untouched until verified below.
        dao.clearTxns()
        dao.clearCategories()
        dao.clearBudgets()
        dao.clearRules()
        dao.clearRecurring()
        dao.clearSettings()

        if (txnRecords.isNotEmpty()) dao.putTxns(txnRecords)
        if (categoryRecords.isNotEmpty()) dao.putCategories(categoryRecords)
        if (budgetRecords.isNotEmpty()) dao.putBudgets(budgetRecords)
        if (ruleRecords.isNotEmpty()) dao.putRules(ruleRecords)
        if (recurringRecords.isNotEmpty()) dao.putRecurringMany(recurringRecords)
        dao.putSettings(settingsRecord)

        val verified = verifyKeyReadsBack(key, categoryId = payload.categories.firstOrNull()?.id, txnId = payload.txns.firstOrNull()?.id)
        if (!verified) {
            throw IllegalStateException(
                "The restore could not be verified and was not completed. This device's previous data has already been cleared - please try importing the backup again.",
            )
        }

        dao.putMeta(MetaRecord(MetaKeys.SALT, result.saltB64))
        dao.putMeta(MetaRecord(MetaKeys.VERIFIER, blobToJsonString(result.verifier)))
        dao.deleteMeta(MetaKeys.BIOMETRIC_WRAPPED)
        KeystoreVaultKeyWrapper.deleteKey()

        VaultKeyHolder.set(key)
        lockoutStore.write(LockoutPolicy.onSuccess())

        HydrateResult(
            txns = payload.txns,
            categories = payload.categories,
            budgets = budgetsWithIds,
            rules = payload.rules,
            recurring = payload.recurring,
            settings = settingsForRestore,
            skippedRecordCount = 0,
        )
    }

    private suspend fun verifyKeyReadsBack(key: SecretKey, categoryId: String?, txnId: String?): Boolean = try {
        val settingsRecord = dao.getAllSettings().firstOrNull() ?: return false
        VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(settingsRecord.iv, settingsRecord.ct))

        if (categoryId != null) {
            val rec = dao.getAllCategories().find { it.id == categoryId } ?: return false
            VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(rec.iv, rec.ct))
        }
        if (txnId != null) {
            val rec = dao.getAllTxns().find { it.id == txnId } ?: return false
            VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(rec.iv, rec.ct))
        }
        true
    } catch (e: Exception) {
        false
    }

    // ---------------------------------------------------------------------
    // Reset
    // ---------------------------------------------------------------------

    /** Wipes everything, including crypto meta and the Keystore wrap key. Used by a full account reset. */
    suspend fun resetAll(): Unit = VaultLock.withLock {
        dao.clearTxns()
        dao.clearCategories()
        dao.clearBudgets()
        dao.clearRules()
        dao.clearRecurring()
        dao.clearSettings()
        dao.clearMeta()
        KeystoreVaultKeyWrapper.deleteKey()
        VaultKeyHolder.clear()
        lockoutStore.write(LockoutPolicy.onSuccess())
    }

    // ---------------------------------------------------------------------
    // Encryption helpers
    // ---------------------------------------------------------------------

    private fun encryptTxn(key: SecretKey, txn: Txn): TxnRecord {
        val blob = VaultCrypto.encryptJSON(key, txn.toJson().stringify())
        return TxnRecord(txn.id, blob.iv, blob.ct)
    }

    private fun encryptCategory(key: SecretKey, category: Category): CategoryRecord {
        val blob = VaultCrypto.encryptJSON(key, category.toJson().stringify())
        return CategoryRecord(category.id, blob.iv, blob.ct)
    }

    private fun encryptSettings(key: SecretKey, settings: Settings): SettingsRecord {
        val blob = VaultCrypto.encryptJSON(key, settings.toJson().stringify())
        return SettingsRecord(SETTINGS_ROW_ID, blob.iv, blob.ct)
    }

    private fun encryptJsonObj(key: SecretKey, json: JsonValue.Obj): VaultCrypto.EncryptedBlob =
        VaultCrypto.encryptJSON(key, json.stringify())

    private fun blobToJsonString(blob: VaultCrypto.EncryptedBlob): String =
        jsonObject { put("iv", blob.iv); put("ct", blob.ct) }.stringify()

    private fun jsonStringToBlob(s: String): VaultCrypto.EncryptedBlob {
        val obj = Json.parse(s) as JsonValue.Obj
        return VaultCrypto.EncryptedBlob(obj.getString("iv"), obj.getString("ct"))
    }

    companion object {
        private const val SETTINGS_ROW_ID = "settings"

        @Volatile
        private var instance: VaultRepository? = null

        fun get(context: Context): VaultRepository =
            instance ?: synchronized(this) {
                instance ?: VaultRepository(context).also { instance = it }
            }
    }
}
