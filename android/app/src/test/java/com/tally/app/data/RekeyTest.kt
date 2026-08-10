package com.tally.app.data

import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import com.tally.app.money.RecurringCadence
import com.tally.app.money.RecurringSeries
import com.tally.app.money.Settings
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.security.VaultCrypto
import com.tally.app.util.Json
import com.tally.app.util.JsonValue
import com.tally.app.util.stringify
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.LocalDate

/**
 * `VaultRepository.changeSecret`'s atomicity itself needs a real Room/SQLite
 * connection to prove (see that function's doc comment and the top-level
 * task report for why that can't run as a host-JVM unit test here). What
 * CAN be — and is the part most likely to actually go wrong — is the pure
 * decrypt-old / abort-on-any-failure / re-encrypt-new logic `Rekey.build`
 * does entirely in memory, with no Room dependency at all. Same split as
 * `Backup.kt` / `BackupValidationTest`.
 */
class RekeyTest {

    private val oldSecret = "135790"
    private val oldSalt = VaultCrypto.generateSalt()
    private val oldKey = VaultCrypto.deriveKey(oldSecret, oldSalt)

    private val newSecret = "246801357"
    private val newSalt = VaultCrypto.generateSalt()
    private val newKey = VaultCrypto.deriveKey(newSecret, newSalt)

    // A key that is neither old nor new — encrypting under this simulates a
    // record that is corrupt/unreadable from `oldKey`'s point of view,
    // exactly like VaultCryptoTest's "reject a wrong key" case.
    private val unrelatedKey = VaultCrypto.deriveKey("999999999", VaultCrypto.generateSalt())

    private fun sampleTxn(id: String = "t1", amountCents: Long = 550L) = Txn(
        id = id, date = LocalDate.of(2026, 8, 1), amountCents = amountCents, description = "Coffee",
        merchant = "Campos", categoryId = "cat-coffee", account = AccountId.CBA, source = TxnSource.MANUAL,
        hash = "abc", createdAt = 1L, updatedAt = 1L,
    )

    private fun sampleCategory(id: String = "cat-coffee") =
        Category(id = id, label = "Coffee", icon = "Coffee", colorToken = "cat-1", kind = CategoryKind.WANT, builtin = true, order = 0)

    private fun sampleBudget() = Budget(categoryId = "cat-coffee", month = "2026-08", limitCents = 20000L)

    private fun sampleRule(id: String = "r1") = Rule(id = id, match = "campos", categoryId = "cat-coffee", createdAt = 1L)

    private fun sampleRecurring(id: String = "rec1") = RecurringSeries(
        id = id, merchant = "Netflix", categoryId = "cat-coffee", cadence = RecurringCadence.MONTHLY,
        amountCents = 1999L, lastSeen = LocalDate.of(2026, 7, 1), nextDue = LocalDate.of(2026, 8, 1),
        txnIds = listOf("t1"),
    )

    private fun sampleSettings() = Settings(
        paydayDayOfMonth = 1, monthlyIncomeCents = 800000L, savingsTargetCents = 50000L,
        lockTimeoutMs = 60_000L, biometricEnabled = true,
    )

    private fun txnRecord(txn: Txn, key: javax.crypto.SecretKey) =
        VaultCrypto.encryptJSON(key, txn.toJson().stringify()).let { TxnRecord(txn.id, it.iv, it.ct) }

    private fun categoryRecord(category: Category, key: javax.crypto.SecretKey) =
        VaultCrypto.encryptJSON(key, category.toJson().stringify()).let { CategoryRecord(category.id, it.iv, it.ct) }

    private fun budgetRecord(id: String, budget: Budget, key: javax.crypto.SecretKey) =
        VaultCrypto.encryptJSON(key, budget.toJson().stringify()).let { BudgetRecord(id, it.iv, it.ct) }

    private fun ruleRecord(rule: Rule, key: javax.crypto.SecretKey) =
        VaultCrypto.encryptJSON(key, rule.toJson().stringify()).let { RuleRecord(rule.id, it.iv, it.ct) }

    private fun recurringRecord(series: RecurringSeries, key: javax.crypto.SecretKey) =
        VaultCrypto.encryptJSON(key, series.toJson().stringify()).let { RecurringRecord(series.id, it.iv, it.ct) }

    private fun settingsRecord(settings: Settings, key: javax.crypto.SecretKey) =
        VaultCrypto.encryptJSON(key, settings.toJson().stringify()).let { SettingsRecord(SETTINGS_ROW_ID, it.iv, it.ct) }

    private fun decryptTxn(record: TxnRecord, key: javax.crypto.SecretKey): Txn =
        txnFromJson(Json.parse(VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(record.iv, record.ct))) as JsonValue.Obj)

    @Test
    fun `a full vault is re-encrypted under the new key with every id preserved`() = runBlocking {
        val txn = sampleTxn()
        val category = sampleCategory()
        val budget = sampleBudget()
        val rule = sampleRule()
        val recurring = sampleRecurring()
        val settings = sampleSettings()

        val result = Rekey.build(
            oldKey = oldKey,
            newKey = newKey,
            txnRows = listOf(txnRecord(txn, oldKey)),
            categoryRows = listOf(categoryRecord(category, oldKey)),
            budgetRows = listOf(budgetRecord("budget-id-1", budget, oldKey)),
            ruleRows = listOf(ruleRecord(rule, oldKey)),
            recurringRows = listOf(recurringRecord(recurring, oldKey)),
            settingsRows = listOf(settingsRecord(settings, oldKey)),
        )

        assertTrue("expected Success, got $result", result is Rekey.Result.Success)
        val plan = (result as Rekey.Result.Success).plan

        // ids preserved
        assertEquals(txn.id, plan.txns[0].id)
        assertEquals(category.id, plan.categories[0].id)
        assertEquals("budget-id-1", plan.budgets[0].id) // budgets have no id field of their own — the storage id must survive
        assertEquals(rule.id, plan.rules[0].id) // unlike the old ChangePin.kt workaround, rules keep their real id now
        assertEquals(recurring.id, plan.recurring[0].id)
        assertEquals(SETTINGS_ROW_ID, plan.settings.id)

        // readable under the NEW key, with content (including integer cents) intact
        val restoredTxn = decryptTxn(plan.txns[0], newKey)
        assertEquals(550L, restoredTxn.amountCents)
        assertEquals("Campos", restoredTxn.merchant)

        val restoredCategory = categoryFromJson(Json.parse(VaultCrypto.decryptJSON(newKey, VaultCrypto.EncryptedBlob(plan.categories[0].iv, plan.categories[0].ct))) as JsonValue.Obj)
        assertEquals("Coffee", restoredCategory.label)

        val restoredBudget = budgetFromJson(Json.parse(VaultCrypto.decryptJSON(newKey, VaultCrypto.EncryptedBlob(plan.budgets[0].iv, plan.budgets[0].ct))) as JsonValue.Obj)
        assertEquals(20000L, restoredBudget.limitCents)

        val restoredSettings = settingsFromJson(Json.parse(VaultCrypto.decryptJSON(newKey, VaultCrypto.EncryptedBlob(plan.settings.iv, plan.settings.ct))) as JsonValue.Obj)
        assertEquals(800000L, restoredSettings.monthlyIncomeCents)

        // NOT readable under the OLD key any more — this is a genuine
        // re-encryption, not a copy of the old ciphertext under a new label.
        try {
            VaultCrypto.decryptJSON(oldKey, VaultCrypto.EncryptedBlob(plan.txns[0].iv, plan.txns[0].ct))
            fail("the re-encrypted record should not decrypt under the old key")
        } catch (e: Exception) {
            // expected: AES-GCM auth failure under the wrong key
        }
    }

    @Test
    fun `a single unreadable record aborts the whole rekey and reports the count`() = runBlocking {
        val good = sampleTxn(id = "t-good")
        val bad = sampleTxn(id = "t-bad")

        val result = Rekey.build(
            oldKey = oldKey,
            newKey = newKey,
            txnRows = listOf(
                txnRecord(good, oldKey),
                txnRecord(bad, unrelatedKey), // encrypted under a key `oldKey` cannot read — simulates corruption
            ),
            categoryRows = listOf(categoryRecord(sampleCategory(), oldKey)),
            budgetRows = emptyList(),
            ruleRows = emptyList(),
            recurringRows = emptyList(),
            settingsRows = listOf(settingsRecord(sampleSettings(), oldKey)),
        )

        assertTrue(result is Rekey.Result.Failure)
        assertEquals(1, (result as Rekey.Result.Failure).unreadableCount)
    }

    @Test
    fun `unreadable records across different stores are all summed`() = runBlocking {
        val result = Rekey.build(
            oldKey = oldKey,
            newKey = newKey,
            txnRows = listOf(txnRecord(sampleTxn(), unrelatedKey)),
            categoryRows = listOf(categoryRecord(sampleCategory(), unrelatedKey)),
            budgetRows = listOf(budgetRecord("b1", sampleBudget(), unrelatedKey)),
            ruleRows = listOf(ruleRecord(sampleRule(), oldKey)), // this one IS readable
            recurringRows = listOf(recurringRecord(sampleRecurring(), oldKey)), // readable too
            settingsRows = listOf(settingsRecord(sampleSettings(), oldKey)),
        )

        assertTrue(result is Rekey.Result.Failure)
        assertEquals(3, (result as Rekey.Result.Failure).unreadableCount)
    }

    @Test
    fun `an empty settings store falls back to defaults rather than writing nothing`() = runBlocking {
        val result = Rekey.build(
            oldKey = oldKey,
            newKey = newKey,
            txnRows = emptyList(),
            categoryRows = emptyList(),
            budgetRows = emptyList(),
            ruleRows = emptyList(),
            recurringRows = emptyList(),
            settingsRows = emptyList(),
        )

        assertTrue("expected Success, got $result", result is Rekey.Result.Success)
        val plan = (result as Rekey.Result.Success).plan
        assertEquals(SETTINGS_ROW_ID, plan.settings.id)
        val restored = settingsFromJson(Json.parse(VaultCrypto.decryptJSON(newKey, VaultCrypto.EncryptedBlob(plan.settings.iv, plan.settings.ct))) as JsonValue.Obj)
        assertEquals(DEFAULT_SETTINGS.currency, restored.currency)
        assertEquals(DEFAULT_SETTINGS.lockTimeoutMs, restored.lockTimeoutMs)
    }

    @Test
    fun `an empty vault (fresh setup, nothing recorded yet) still rekeys cleanly`() = runBlocking {
        val result = Rekey.build(
            oldKey = oldKey,
            newKey = newKey,
            txnRows = emptyList(),
            categoryRows = emptyList(),
            budgetRows = emptyList(),
            ruleRows = emptyList(),
            recurringRows = emptyList(),
            settingsRows = listOf(settingsRecord(sampleSettings(), oldKey)),
        )

        assertTrue(result is Rekey.Result.Success)
        val plan = (result as Rekey.Result.Success).plan
        assertTrue(plan.txns.isEmpty())
        assertTrue(plan.categories.isEmpty())
        assertFalse(plan.settings.iv.isEmpty())
    }

    @Test
    fun `a large-magnitude amount survives rekey with no precision loss`() = runBlocking {
        val huge = 9_007_199_254_740_993L // one past Double's exact-integer limit
        val txn = sampleTxn(amountCents = huge)

        val result = Rekey.build(
            oldKey = oldKey,
            newKey = newKey,
            txnRows = listOf(txnRecord(txn, oldKey)),
            categoryRows = emptyList(),
            budgetRows = emptyList(),
            ruleRows = emptyList(),
            recurringRows = emptyList(),
            settingsRows = listOf(settingsRecord(sampleSettings(), oldKey)),
        )

        assertTrue("expected Success, got $result", result is Rekey.Result.Success)
        val plan = (result as Rekey.Result.Success).plan
        assertEquals(huge, decryptTxn(plan.txns[0], newKey).amountCents)
    }
}
