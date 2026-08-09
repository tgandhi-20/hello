package com.tally.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

/**
 * Tally — Room DAO. One explicit method set per store rather than a generic
 * DAO abstraction: Room's compile-time SQL verification and code generation
 * are easiest to get right, and easiest to be confident about without a
 * local build, when every query is spelled out rather than templated.
 */
@Dao
interface TallyDao {

    // ---- txns ----
    @Query("SELECT * FROM txns")
    suspend fun getAllTxns(): List<TxnRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putTxn(record: TxnRecord)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putTxns(records: List<TxnRecord>)

    @Query("DELETE FROM txns WHERE id = :id")
    suspend fun deleteTxn(id: String)

    @Query("DELETE FROM txns")
    suspend fun clearTxns()

    // ---- categories ----
    @Query("SELECT * FROM categories")
    suspend fun getAllCategories(): List<CategoryRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putCategory(record: CategoryRecord)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putCategories(records: List<CategoryRecord>)

    @Query("DELETE FROM categories WHERE id = :id")
    suspend fun deleteCategory(id: String)

    @Query("DELETE FROM categories")
    suspend fun clearCategories()

    // ---- budgets ----
    @Query("SELECT * FROM budgets")
    suspend fun getAllBudgets(): List<BudgetRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putBudget(record: BudgetRecord)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putBudgets(records: List<BudgetRecord>)

    @Query("DELETE FROM budgets WHERE id = :id")
    suspend fun deleteBudget(id: String)

    @Query("DELETE FROM budgets")
    suspend fun clearBudgets()

    // ---- rules ----
    @Query("SELECT * FROM rules")
    suspend fun getAllRules(): List<RuleRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRule(record: RuleRecord)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRules(records: List<RuleRecord>)

    @Query("DELETE FROM rules WHERE id = :id")
    suspend fun deleteRule(id: String)

    @Query("DELETE FROM rules")
    suspend fun clearRules()

    // ---- recurring ----
    @Query("SELECT * FROM recurring")
    suspend fun getAllRecurring(): List<RecurringRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRecurring(record: RecurringRecord)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRecurringMany(records: List<RecurringRecord>)

    @Query("DELETE FROM recurring WHERE id = :id")
    suspend fun deleteRecurring(id: String)

    @Query("DELETE FROM recurring")
    suspend fun clearRecurring()

    // ---- settings (single row, id = 'settings') ----
    @Query("SELECT * FROM settings")
    suspend fun getAllSettings(): List<SettingsRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putSettings(record: SettingsRecord)

    @Query("DELETE FROM settings")
    suspend fun clearSettings()

    // ---- meta (crypto bookkeeping — salt, verifier, unlockConfig, biometric wrap) ----
    @Query("SELECT * FROM meta WHERE `key` = :metaKey")
    suspend fun getMeta(metaKey: String): MetaRecord?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMeta(record: MetaRecord)

    @Query("DELETE FROM meta WHERE `key` = :metaKey")
    suspend fun deleteMeta(metaKey: String)

    @Query("DELETE FROM meta")
    suspend fun clearMeta()
}
