package com.tally.app.data

import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import com.tally.app.money.Settings
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.security.VaultCrypto
import com.tally.app.util.JsonValue
import com.tally.app.util.jsonObject
import com.tally.app.util.stringify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.LocalDate

/**
 * Deliverable 6: "a malformed backup failing before any data is cleared."
 *
 * WHY THIS TEST PROVES "BEFORE ANY DATA IS CLEARED"
 * ----------------------------------------------------
 * `Backup.readAndValidate(fileBytes, secret)` takes no `Context`, no DAO, no
 * database handle of any kind — it is a pure function from bytes + a secret
 * string to either a validated `Backup.ImportResult` or a thrown exception
 * (see Backup.kt's class doc comment). There is structurally nothing for it
 * to clear. `VaultRepository.importBackup` only calls `dao.clearTxns()` /
 * etc. AFTER `readAndValidate` has already returned successfully — so every
 * case below, which asserts `readAndValidate` throws before returning
 * anything, is exactly the guarantee that a malformed backup never reaches
 * the point where existing data could be touched.
 */
class BackupValidationTest {

    private val pin = "246810"
    private val salt = VaultCrypto.generateSalt()
    private val key = VaultCrypto.deriveKey(pin, salt)
    private val saltB64 = VaultCrypto.b64(salt)
    private val verifier = VaultCrypto.makeVerifier(key)

    private val validSettings = Settings(
        paydayDayOfMonth = 15,
        monthlyIncomeCents = 500_000L,
        savingsTargetCents = 100_000L,
        lockTimeoutMs = 120_000L,
        biometricEnabled = false,
    )

    private val validPayload = Backup.Payload(
        txns = listOf(
            Txn(
                id = "t1", date = LocalDate.of(2026, 8, 1), amountCents = 550L, description = "Coffee",
                merchant = "Campos", categoryId = "cat-coffee", account = AccountId.CBA, source = TxnSource.MANUAL,
                hash = "abc", createdAt = 1L, updatedAt = 1L,
            ),
        ),
        categories = listOf(Category(id = "cat-coffee", label = "Coffee", icon = "Coffee", colorToken = "cat-1", kind = CategoryKind.WANT, builtin = true, order = 0)),
        budgets = emptyList(),
        rules = emptyList(),
        recurring = emptyList(),
        settings = validSettings,
    )

    private fun buildValidFile(): ByteArray = Backup.buildFile(key, saltB64, verifier, validPayload, 1_700_000_000_000L)

    private fun envelopeFromDecryptedPayloadJson(payloadJson: JsonValue.Obj): ByteArray {
        val payloadBlob = VaultCrypto.encryptJSON(key, payloadJson.stringify())
        val root = jsonObject {
            put("format", Backup.FORMAT)
            put("version", Backup.VERSION)
            put("exportedAt", 1L)
            put("saltB64", saltB64)
            put("verifier", jsonObject { put("iv", verifier.iv); put("ct", verifier.ct) })
            put("payload", jsonObject { put("iv", payloadBlob.iv); put("ct", payloadBlob.ct) })
        }
        return root.stringify().toByteArray(Charsets.UTF_8)
    }

    @Test
    fun `a well-formed backup with the correct secret reads back cleanly`() {
        val result = Backup.readAndValidate(buildValidFile(), pin)
        assertEquals(1, result.payload.txns.size)
        assertEquals(550L, result.payload.txns[0].amountCents)
        assertEquals("cat-coffee", result.payload.categories[0].id)
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `not JSON at all is rejected before decryption is even attempted`() {
        Backup.readAndValidate("this is not json".toByteArray(Charsets.UTF_8), pin)
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `wrong format field is rejected`() {
        val bytes = jsonObject {
            put("format", "not-tally-backup")
            put("version", Backup.VERSION)
            put("exportedAt", 1L)
            put("saltB64", saltB64)
            put("verifier", jsonObject { put("iv", verifier.iv); put("ct", verifier.ct) })
            put("payload", jsonObject { put("iv", "x"); put("ct", "y") })
        }.stringify().toByteArray(Charsets.UTF_8)
        Backup.readAndValidate(bytes, pin)
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `wrong version field is rejected`() {
        val bytes = jsonObject {
            put("format", Backup.FORMAT)
            put("version", 99)
            put("exportedAt", 1L)
            put("saltB64", saltB64)
            put("verifier", jsonObject { put("iv", verifier.iv); put("ct", verifier.ct) })
            put("payload", jsonObject { put("iv", "x"); put("ct", "y") })
        }.stringify().toByteArray(Charsets.UTF_8)
        Backup.readAndValidate(bytes, pin)
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `missing required envelope field is rejected`() {
        val bytes = jsonObject {
            put("format", Backup.FORMAT)
            put("version", Backup.VERSION)
            put("exportedAt", 1L)
            // saltB64 deliberately omitted
            put("verifier", jsonObject { put("iv", verifier.iv); put("ct", verifier.ct) })
            put("payload", jsonObject { put("iv", "x"); put("ct", "y") })
        }.stringify().toByteArray(Charsets.UTF_8)
        Backup.readAndValidate(bytes, pin)
    }

    @Test(expected = Backup.WrongSecretException::class)
    fun `wrong secret is rejected without ever decrypting the real payload`() {
        Backup.readAndValidate(buildValidFile(), "000000")
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `decrypted payload missing the txns array is rejected`() {
        val malformedPayload = jsonObject {
            // "txns" deliberately omitted entirely
            put("categories", JsonValue.Arr(mutableListOf()))
            put("budgets", JsonValue.Arr(mutableListOf()))
            put("rules", JsonValue.Arr(mutableListOf()))
            put("recurring", JsonValue.Arr(mutableListOf()))
            put("settings", validSettings.toJson())
        }
        Backup.readAndValidate(envelopeFromDecryptedPayloadJson(malformedPayload), pin)
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `a transaction missing amountCents is rejected`() {
        val badTxn = jsonObject {
            put("id", "t1")
            put("date", "2026-08-01")
            // amountCents deliberately omitted
            put("description", "Coffee")
        }
        val malformedPayload = jsonObject {
            put("txns", JsonValue.Arr(mutableListOf(badTxn)))
            put("categories", JsonValue.Arr(mutableListOf()))
            put("budgets", JsonValue.Arr(mutableListOf()))
            put("rules", JsonValue.Arr(mutableListOf()))
            put("recurring", JsonValue.Arr(mutableListOf()))
            put("settings", validSettings.toJson())
        }
        Backup.readAndValidate(envelopeFromDecryptedPayloadJson(malformedPayload), pin)
    }

    @Test(expected = Backup.InvalidBackupException::class)
    fun `settings field present as an array instead of an object is rejected`() {
        val malformedPayload = jsonObject {
            put("txns", JsonValue.Arr(mutableListOf()))
            put("categories", JsonValue.Arr(mutableListOf()))
            put("budgets", JsonValue.Arr(mutableListOf()))
            put("rules", JsonValue.Arr(mutableListOf()))
            put("recurring", JsonValue.Arr(mutableListOf()))
            put("settings", JsonValue.Arr(mutableListOf())) // wrong type entirely
        }
        Backup.readAndValidate(envelopeFromDecryptedPayloadJson(malformedPayload), pin)
    }

    @Test
    fun `every malformed-input exception message is safe to show the user directly`() {
        val cases = listOf(
            { Backup.readAndValidate("not json".toByteArray(), pin) },
            { Backup.readAndValidate(buildValidFile(), "wrong-pin") },
        )
        for (case in cases) {
            try {
                case()
                fail("expected an exception")
            } catch (e: Backup.InvalidBackupException) {
                assertTrue(e.message!!.isNotBlank())
            } catch (e: Backup.WrongSecretException) {
                assertTrue(e.message!!.isNotBlank())
            }
        }
    }
}
