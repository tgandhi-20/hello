package com.tally.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Tally — Room entities. Kotlin port of src/data/db.ts's IndexedDB schema.
 *
 * Every financial object store mirrors the web app's shape exactly: `id` (a
 * random UUID — see `java.util.UUID.randomUUID()` at every call site that
 * creates one; ids never encode financial meaning), plus an AES-GCM
 * `iv`/`ct` pair (see VaultCrypto.EncryptedBlob). Room/SQLite never sees
 * plaintext — only these three columns. A raw dump of the .db file reveals
 * no merchant names, no amounts, no categories: nothing but ciphertext and
 * ids.
 */
interface EncryptedRow {
    val id: String
    val iv: String
    val ct: String
}

@Entity(tableName = "txns")
data class TxnRecord(
    @PrimaryKey override val id: String,
    override val iv: String,
    override val ct: String,
) : EncryptedRow

@Entity(tableName = "categories")
data class CategoryRecord(
    @PrimaryKey override val id: String,
    override val iv: String,
    override val ct: String,
) : EncryptedRow

@Entity(tableName = "budgets")
data class BudgetRecord(
    @PrimaryKey override val id: String,
    override val iv: String,
    override val ct: String,
) : EncryptedRow

@Entity(tableName = "rules")
data class RuleRecord(
    @PrimaryKey override val id: String,
    override val iv: String,
    override val ct: String,
) : EncryptedRow

@Entity(tableName = "recurring")
data class RecurringRecord(
    @PrimaryKey override val id: String,
    override val iv: String,
    override val ct: String,
) : EncryptedRow

@Entity(tableName = "settings")
data class SettingsRecord(
    @PrimaryKey override val id: String,
    override val iv: String,
    override val ct: String,
) : EncryptedRow

/**
 * Crypto bookkeeping only — salt, PIN verifier, unlock config, biometric
 * wrap blob. NOT financial data; mirrors src/data/db.ts's `meta` store.
 * `valueJson` holds either a bare base64 string (the salt) or small JSON
 * object text (verifier/unlockConfig/biometric wrap) — never a plaintext
 * financial field.
 */
@Entity(tableName = "meta")
data class MetaRecord(
    @PrimaryKey val key: String,
    val valueJson: String,
)
