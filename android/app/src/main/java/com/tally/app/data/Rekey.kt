package com.tally.app.data

import com.tally.app.money.Category
import com.tally.app.money.Txn
import com.tally.app.security.VaultCrypto
import com.tally.app.util.stringify
import javax.crypto.SecretKey

/**
 * Tally — the atomic-rekey plan builder behind `VaultRepository.changeSecret`.
 *
 * WHY THIS IS A SEPARATE, CONTEXT-FREE OBJECT (mirrors Backup.kt's split)
 * ------------------------------------------------------------------------
 * `build()` takes no `Context`, no DAO, no database handle — only the
 * already-fetched ciphertext rows plus the old and new keys — and returns
 * either a fully re-encrypted [Plan] or a [Result.Failure] telling the
 * caller how many records could not be read. There is structurally nothing
 * for it to write, which is what makes it possible to unit-test the whole
 * "decrypt everything under the old key, abort on any failure, else
 * re-encrypt everything under the new key" contract on the host JVM, the
 * same way `BackupValidationTest`/`CentsRoundTripTest` exercise `Backup.kt`
 * without ever touching Room.
 *
 * RESILIENT-DECRYPT CONVENTION, BUT INVERTED (see DecryptBatch.kt)
 * ------------------------------------------------------------------
 * `hydrateAll` decrypts every store with `decryptAll`/`decryptAllWithIds` —
 * the same resilient, per-record `runCatching` this reuses — and tolerates
 * a handful of bad records by skipping and counting them, because an
 * ordinary unlock must never be blocked by one corrupt row.
 *
 * A rekey is different: skipping a record here does not mean "the user
 * doesn't see it this session," it means "this record is silently left
 * encrypted under the OLD key forever, because nothing will ever write it
 * again under the NEW one." That converts one unreadable record into one
 * PERMANENTLY unreadable record the moment the new salt/verifier commit —
 * the exact bug this whole primitive exists to close (see
 * `VaultRepository.changeSecret`'s doc comment). So here, any skip at all
 * aborts the entire plan before a single byte is re-encrypted, and the
 * caller reports the count rather than proceeding with a partial vault.
 */
object Rekey {

    sealed class Result {
        data class Success(val plan: Plan) : Result()

        /** How many records — summed across every store — did not decrypt/parse under the old key. Nothing was re-encrypted. */
        data class Failure(val unreadableCount: Int) : Result()
    }

    /** Every store, fully re-encrypted under the new key, still entirely in memory — ready for one atomic write. */
    data class Plan(
        val txns: List<TxnRecord>,
        val categories: List<CategoryRecord>,
        val budgets: List<BudgetRecord>,
        val rules: List<RuleRecord>,
        val recurring: List<RecurringRecord>,
        val settings: SettingsRecord,
    )

    suspend fun build(
        oldKey: SecretKey,
        newKey: SecretKey,
        txnRows: List<TxnRecord>,
        categoryRows: List<CategoryRecord>,
        budgetRows: List<BudgetRecord>,
        ruleRows: List<RuleRecord>,
        recurringRows: List<RecurringRecord>,
        settingsRows: List<SettingsRecord>,
    ): Result {
        // Concurrent, resilient decrypt of every store under the OLD key —
        // same shape as hydrateAll (see that function's doc comment for why
        // each is awaited individually rather than via awaitAll).
        val txnsD = decryptAll(txnRows, oldKey, ::txnFromJson)
        val categoriesD = decryptAll(categoryRows, oldKey, ::categoryFromJson)
        val budgetsD = decryptAllWithIds(budgetRows, oldKey, ::budgetFromJson)
        val rulesD = decryptAll(ruleRows, oldKey, ::ruleFromJson)
        val recurringD = decryptAll(recurringRows, oldKey, ::recurringFromJson)
        val settingsD = decryptAll(settingsRows, oldKey, ::settingsFromJson)

        val unreadable = txnsD.skipped + categoriesD.skipped + budgetsD.skipped +
            rulesD.skipped + recurringD.skipped + settingsD.skipped
        if (unreadable > 0) {
            // Abort BEFORE any re-encryption: nothing derived from a partial
            // read is allowed to exist even in memory past this point.
            return Result.Failure(unreadable)
        }

        val newTxns = txnsD.items.map { encryptTxn(newKey, it) }
        val newCategories = categoriesD.items.map { encryptCategory(newKey, it) }
        val newBudgets = budgetsD.items.map { (id, budget) ->
            val blob = VaultCrypto.encryptJSON(newKey, budget.toJson().stringify())
            BudgetRecord(id, blob.iv, blob.ct)
        }
        val newRules = rulesD.items.map { rule ->
            val blob = VaultCrypto.encryptJSON(newKey, rule.toJson().stringify())
            RuleRecord(rule.id, blob.iv, blob.ct)
        }
        val newRecurring = recurringD.items.map { series ->
            val blob = VaultCrypto.encryptJSON(newKey, series.toJson().stringify())
            RecurringRecord(series.id, blob.iv, blob.ct)
        }
        // Exactly one settings row, same guarantee `setupPin`/`hydrateAll`
        // already give: fall back to DEFAULT_SETTINGS if (unexpectedly) the
        // store is empty rather than writing nothing.
        val settingsValue = settingsD.items.firstOrNull() ?: DEFAULT_SETTINGS
        val settingsBlob = VaultCrypto.encryptJSON(newKey, settingsValue.toJson().stringify())
        val newSettings = SettingsRecord(SETTINGS_ROW_ID, settingsBlob.iv, settingsBlob.ct)

        return Result.Success(
            Plan(
                txns = newTxns,
                categories = newCategories,
                budgets = newBudgets,
                rules = newRules,
                recurring = newRecurring,
                settings = newSettings,
            ),
        )
    }

    private fun encryptTxn(key: SecretKey, txn: Txn): TxnRecord {
        val blob = VaultCrypto.encryptJSON(key, txn.toJson().stringify())
        return TxnRecord(txn.id, blob.iv, blob.ct)
    }

    private fun encryptCategory(key: SecretKey, category: Category): CategoryRecord {
        val blob = VaultCrypto.encryptJSON(key, category.toJson().stringify())
        return CategoryRecord(category.id, blob.iv, blob.ct)
    }
}
