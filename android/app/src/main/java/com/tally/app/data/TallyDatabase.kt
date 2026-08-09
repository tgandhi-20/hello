package com.tally.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Tally — the Room database. Kotlin analogue of src/data/db.ts's `openDb()`.
 * Every table here holds ciphertext-only rows except `meta` (crypto
 * bookkeeping, not financial data — see MetaRecord's doc comment).
 */
@Database(
    entities = [
        TxnRecord::class,
        CategoryRecord::class,
        BudgetRecord::class,
        RuleRecord::class,
        RecurringRecord::class,
        SettingsRecord::class,
        MetaRecord::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class TallyDatabase : RoomDatabase() {
    abstract fun dao(): TallyDao

    companion object {
        @Volatile
        private var instance: TallyDatabase? = null

        fun get(context: Context): TallyDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    TallyDatabase::class.java,
                    "tally-db",
                ).build().also { instance = it }
            }
    }
}
