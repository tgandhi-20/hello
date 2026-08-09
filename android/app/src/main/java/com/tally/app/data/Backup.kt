package com.tally.app.data

import com.tally.app.security.VaultCrypto
import com.tally.app.util.Json
import com.tally.app.util.JsonParseException
import com.tally.app.util.JsonValue
import com.tally.app.util.getString
import com.tally.app.util.jsonObject
import com.tally.app.util.optInt
import com.tally.app.util.optObject
import com.tally.app.util.optString
import com.tally.app.util.stringify
import javax.crypto.SecretKey

/**
 * Tally — `.tally` encrypted backup file. Kotlin port of src/data/backup.ts
 * plus the relevant slice of useStore.ts's `exportBackup`/`importBackup`
 * (CONTRACTS.md §5, deliverable 3 — this is the whole migration path off
 * the PWA).
 *
 * ENVELOPE BYTE-COMPATIBILITY WITH THE WEB APP
 * -----------------------------------------------
 * Same top-level JSON shape as `TallyBackupFile` in backup.ts:
 * `format` ("tally-backup"), `version` (1), `exportedAt` (unix ms),
 * `saltB64` (base64 PBKDF2 salt), `verifier` ({iv, ct}), `payload` ({iv, ct}).
 * `saltB64`/`verifier`/`payload` are read here with the SAME crypto
 * primitives VaultCrypto uses (PBKDF2-SHA256/600k/AES-256-GCM), which were
 * independently verified byte-for-byte against WebCrypto — see
 * VaultCrypto's doc comment and VaultCryptoTest's known-answer tests. A
 * `.tally` file exported by the web app is therefore readable here with no
 * conversion step: the file's bytes are parsed exactly as JSON, the same
 * salt/IV/ciphertext bytes are fed through the same algorithms, and the
 * decrypted JSON payload is parsed field-for-field the same way (see
 * data/Models.kt's `*FromJson` functions, whose field names match
 * src/types.ts exactly).
 *
 * THE P0 THIS PRESERVES (deliverable 3's non-negotiable)
 * -----------------------------------------------------------
 * `readAndValidate` NEVER touches Room/the database — it is a pure function
 * from file bytes + secret to a validated, fully-decrypted `Payload` in
 * memory, or a thrown exception. Every failure mode (bad JSON, wrong
 * format/version, wrong PIN, AES-GCM auth failure, or a decrypted payload
 * whose shape doesn't check out) is detected and thrown from here, before
 * the caller (VaultRepository.importBackup) is allowed to clear a single
 * row of the existing vault. This is the fix for the web app's original
 * bug, where `importBackup` cleared the vault FIRST and only then
 * discovered the file was malformed.
 */
object Backup {
    const val FORMAT = "tally-backup"
    const val VERSION = 1

    data class Payload(
        val txns: List<Txn>,
        val categories: List<Category>,
        val budgets: List<Budget>,
        val rules: List<Rule>,
        val recurring: List<RecurringSeries>,
        val settings: Settings,
    )

    /** Result of a successful `readAndValidate`: the payload, plus everything needed to make it the vault's new active key/meta. */
    data class ImportResult(
        val payload: Payload,
        val key: SecretKey,
        val saltB64: String,
        val verifier: VaultCrypto.EncryptedBlob,
    )

    /** The file isn't shaped like a Tally backup, or its decrypted contents don't check out. Vault is guaranteed untouched. */
    class InvalidBackupException(message: String) : Exception(message)

    /** The file IS a Tally backup, but `secret` doesn't unlock it. Vault is guaranteed untouched. */
    class WrongSecretException(message: String) : Exception(message)

    private const val CORRUPT_MESSAGE = "That backup file is incomplete or corrupted. Your data has not been changed."
    private const val NOT_A_BACKUP_MESSAGE = "That file is not a valid Tally backup."

    /**
     * Validate a DECRYPTED payload BEFORE anything about the existing vault
     * is touched — mirrors `assertValidBackupPayload` in backup.ts
     * field-for-field. AES-GCM authentication only proves the ciphertext was
     * produced by someone holding the derived key; it says nothing about
     * whether the plaintext is actually a usable backup. Anyone can author a
     * well-formed `.tally` envelope with a PIN of their choosing, so shape
     * validation of the decrypted payload is a separate, required step.
     */
    fun validatePayloadJson(payload: JsonValue.Obj) {
        fun bad(): Nothing = throw InvalidBackupException(CORRUPT_MESSAGE)

        for (field in listOf("txns", "categories", "budgets", "rules", "recurring")) {
            val v = payload.entries[field]
            if (v !is JsonValue.Arr) bad()
        }
        val settings = payload.entries["settings"]
        if (settings !is JsonValue.Obj) bad()

        val txns = (payload.entries["txns"] as JsonValue.Arr).items
        for (t in txns) {
            if (t !is JsonValue.Obj) bad()
            val idOk = (t.entries["id"] as? JsonValue.Str)?.value?.isNotEmpty() == true
            val dateOk = t.entries["date"] is JsonValue.Str
            val amountOk = t.entries["amountCents"] is JsonValue.Num
            if (!idOk || !dateOk || !amountOk) bad()
        }

        val categories = (payload.entries["categories"] as JsonValue.Arr).items
        for (c in categories) {
            if (c !is JsonValue.Obj) bad()
            val idOk = c.entries["id"] is JsonValue.Str
            val labelOk = c.entries["label"] is JsonValue.Str
            if (!idOk || !labelOk) bad()
        }
    }

    fun parsePayload(payload: JsonValue.Obj): Payload {
        val txns = (payload.entries["txns"] as JsonValue.Arr).items
        val categories = (payload.entries["categories"] as JsonValue.Arr).items
        val budgets = (payload.entries["budgets"] as JsonValue.Arr).items
        val rules = (payload.entries["rules"] as JsonValue.Arr).items
        val recurring = (payload.entries["recurring"] as JsonValue.Arr).items
        val settings = payload.entries["settings"] as JsonValue.Obj
        return Payload(
            txns = txns.map { txnFromJson(it as JsonValue.Obj) },
            categories = categories.map { categoryFromJson(it as JsonValue.Obj) },
            budgets = budgets.map { budgetFromJson(it as JsonValue.Obj) },
            rules = rules.map { ruleFromJson(it as JsonValue.Obj) },
            recurring = recurring.map { recurringFromJson(it as JsonValue.Obj) },
            settings = settingsFromJson(settings),
        )
    }

    fun payloadToJson(payload: Payload): JsonValue.Obj = jsonObject {
        put("txns", JsonValue.Arr(payload.txns.map { it.toJson() as JsonValue }.toMutableList()))
        put("categories", JsonValue.Arr(payload.categories.map { it.toJson() as JsonValue }.toMutableList()))
        put("budgets", JsonValue.Arr(payload.budgets.map { it.toJson() as JsonValue }.toMutableList()))
        put("rules", JsonValue.Arr(payload.rules.map { it.toJson() as JsonValue }.toMutableList()))
        put("recurring", JsonValue.Arr(payload.recurring.map { it.toJson() as JsonValue }.toMutableList()))
        put("settings", payload.settings.toJson())
    }

    /**
     * Read, decrypt, and validate a `.tally` file's bytes with `secret` (PIN
     * or passphrase). Throws `InvalidBackupException` if the envelope's
     * shape is wrong before decryption is even attempted, `WrongSecretException`
     * if `secret` doesn't match this file's verifier, and
     * `InvalidBackupException` again if the DECRYPTED payload doesn't
     * validate. This function never touches Room/the database — see the
     * class doc comment.
     */
    fun readAndValidate(fileBytes: ByteArray, secret: String): ImportResult {
        val text = String(fileBytes, Charsets.UTF_8)
        val root = try {
            Json.parse(text) as JsonValue.Obj
        } catch (e: Exception) {
            throw InvalidBackupException(NOT_A_BACKUP_MESSAGE)
        }

        if (root.optString("format") != FORMAT || root.optInt("version", -1) != VERSION) {
            throw InvalidBackupException(NOT_A_BACKUP_MESSAGE)
        }

        val saltB64 = root.optString("saltB64", "")
        val verifierObj = root.optObject("verifier")
        val payloadObjEnvelope = root.optObject("payload")
        if (saltB64.isEmpty() || verifierObj == null || payloadObjEnvelope == null) {
            throw InvalidBackupException(NOT_A_BACKUP_MESSAGE)
        }

        val verifierBlob = try {
            VaultCrypto.EncryptedBlob(verifierObj.getString("iv"), verifierObj.getString("ct"))
        } catch (e: JsonParseException) {
            throw InvalidBackupException(NOT_A_BACKUP_MESSAGE)
        }
        val payloadBlob = try {
            VaultCrypto.EncryptedBlob(payloadObjEnvelope.getString("iv"), payloadObjEnvelope.getString("ct"))
        } catch (e: JsonParseException) {
            throw InvalidBackupException(NOT_A_BACKUP_MESSAGE)
        }

        val salt = try {
            VaultCrypto.unb64(saltB64)
        } catch (e: Exception) {
            throw InvalidBackupException(NOT_A_BACKUP_MESSAGE)
        }

        val key = VaultCrypto.deriveKey(secret, salt)

        if (!VaultCrypto.checkVerifier(key, verifierBlob)) {
            throw WrongSecretException("Incorrect PIN for this backup.")
        }

        val decryptedText = try {
            VaultCrypto.decryptJSON(key, payloadBlob)
        } catch (e: Exception) {
            // AES-GCM auth failure or truncation on the payload specifically.
            // The verifier already checked out above, so this really
            // shouldn't happen — but a single decrypt call must never be the
            // only thing standing between a corrupt file and clearing the
            // vault, so it is still caught and turned into a clean failure.
            throw InvalidBackupException(CORRUPT_MESSAGE)
        }

        val payloadObj = try {
            Json.parse(decryptedText) as JsonValue.Obj
        } catch (e: Exception) {
            throw InvalidBackupException(CORRUPT_MESSAGE)
        }

        validatePayloadJson(payloadObj)
        val payload = parsePayload(payloadObj)
        return ImportResult(payload = payload, key = key, saltB64 = saltB64, verifier = verifierBlob)
    }

    /** Encrypt `payload` under `key` into a `.tally` file's bytes, using the SAME salt/verifier this vault already has. */
    fun buildFile(
        key: SecretKey,
        saltB64: String,
        verifier: VaultCrypto.EncryptedBlob,
        payload: Payload,
        exportedAtEpochMs: Long,
    ): ByteArray {
        val payloadBlob = VaultCrypto.encryptJSON(key, payloadToJson(payload).stringify())
        val root = jsonObject {
            put("format", FORMAT)
            put("version", VERSION)
            put("exportedAt", exportedAtEpochMs)
            put("saltB64", saltB64)
            put(
                "verifier",
                jsonObject {
                    put("iv", verifier.iv)
                    put("ct", verifier.ct)
                },
            )
            put(
                "payload",
                jsonObject {
                    put("iv", payloadBlob.iv)
                    put("ct", payloadBlob.ct)
                },
            )
        }
        return root.stringify().toByteArray(Charsets.UTF_8)
    }
}
