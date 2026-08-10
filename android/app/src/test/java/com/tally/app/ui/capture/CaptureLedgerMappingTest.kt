package com.tally.app.ui.capture

import com.tally.app.capture.model.AccountIds
import com.tally.app.capture.model.PendingCapture
import com.tally.app.csvimport.DedupeFields
import com.tally.app.csvimport.dedupeGroupKey
import com.tally.app.csvimport.hashTxn
import com.tally.app.data.Rule as VaultRule
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import com.tally.app.money.TxnSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/**
 * These target the pure functions in `CaptureLedgerMapping.kt` directly --
 * no `VaultRepository`/Android `Context` involved, so they run on the host
 * JVM exactly like every other agent's `src/test/` suite (see that file's
 * own doc comment for why `VaultCaptureBridge` itself cannot be tested this
 * way).
 */
class CaptureLedgerMappingTest {

    private val postedAt = 1_754_722_800_000L
    private val expectedDate = Instant.ofEpochMilli(postedAt).atZone(ZoneId.systemDefault()).toLocalDate()

    private val categories = listOf(
        Category(id = "cat-coffee", label = "Coffee", icon = "coffee", colorToken = "cat-1", kind = CategoryKind.WANT, builtin = true, order = 0),
        Category(id = "cat-other", label = "Other", icon = "tag", colorToken = "cat-2", kind = CategoryKind.WANT, builtin = true, order = 1),
    )

    private fun capture(
        id: String = "cap-1",
        account: String? = AccountIds.CBA,
        amountCents: Long = 550L,
        merchant: String = "campos coffee",
    ): PendingCapture = PendingCapture(
        id = id,
        packageName = "com.commbank.netbank",
        account = account,
        amountCents = amountCents,
        merchant = merchant,
        rawText = "You spent \$5.50 at CAMPOS COFFEE",
        postedAt = postedAt,
        dedupeHash = null,
    )

    @Test
    fun `maps every field -- description carries the raw merchant text, merchant carries the cleaned display name`() {
        val txn = pendingCaptureToTxnCandidate(capture(), categories, rules = emptyList())

        assertTrue(txn != null)
        txn!!
        assertEquals(expectedDate, txn.date)
        assertEquals(550L, txn.amountCents)
        // description is the RAW capture.merchant, verbatim -- this is what the
        // review queue's own pre-check hash (CaptureDedupeHash, computed from
        // capture.merchant) was built from, so it must match exactly.
        assertEquals("campos coffee", txn.description)
        // merchant is the cleaned/canonical display name from categorisation.
        assertEquals("Campos Coffee", txn.merchant)
        assertEquals("cat-coffee", txn.categoryId)
        assertEquals(AccountId.CBA, txn.account)
        assertEquals(TxnSource.MANUAL, txn.source)
    }

    @Test
    fun `a wallet tap with no account maps to nothing -- never guessed`() {
        assertNull(pendingCaptureToTxnCandidate(capture(account = null), categories, rules = emptyList()))
    }

    @Test
    fun `an unrecognised account string maps to nothing rather than throwing`() {
        assertNull(pendingCaptureToTxnCandidate(capture(account = "not-a-real-account"), categories, rules = emptyList()))
    }

    @Test
    fun `a user rule wins over the generic dictionary, same as CSV import`() {
        val rules = listOf(VaultRule(id = "r1", match = "campos", categoryId = "cat-other", createdAt = 0L))
        val txn = pendingCaptureToTxnCandidate(capture(), categories, rules = toCategorizeRules(rules))
        assertEquals("cat-other", txn!!.categoryId)
    }

    @Test
    fun `toCategorizeRules is a plain field copy`() {
        val vaultRule = VaultRule(id = "r1", match = "woolies", categoryId = "cat-groceries", createdAt = 123L)
        val mapped = toCategorizeRules(listOf(vaultRule)).single()
        assertEquals("r1", mapped.id)
        assertEquals("woolies", mapped.match)
        assertEquals("cat-groceries", mapped.categoryId)
        assertEquals(123L, mapped.createdAt)
    }

    /**
     * The regression this whole mapping exists to avoid at the accept layer
     * (see `VaultCaptureBridge`/`AcceptedCaptureWriter`'s doc comments): two
     * genuinely distinct same-day identical captures must predict two
     * DIFFERENT hashes (occurrence 0 and 1), matching exactly what
     * `VaultRepository.addTxns` will assign when handed both in one batch.
     */
    @Test
    fun `predictBatchHashes assigns occurrence 0 and 1 to two identical same-day captures`() {
        val a = capture(id = "cap-1")
        val b = capture(id = "cap-2")
        val txnA = pendingCaptureToTxnCandidate(a, categories, emptyList())!!
        val txnB = pendingCaptureToTxnCandidate(b, categories, emptyList())!!

        val byHash = predictBatchHashes(listOf(a to txnA, b to txnB))

        assertEquals(2, byHash.size)
        val expectedHash0 = hashTxn(txnA.date, txnA.amountCents, txnA.description, txnA.account, 0)
        val expectedHash1 = hashTxn(txnB.date, txnB.amountCents, txnB.description, txnB.account, 1)
        assertEquals(a, byHash[expectedHash0])
        assertEquals(b, byHash[expectedHash1])
    }

    @Test
    fun `predictBatchHashes matches the exact group key VaultRepository addTxns computes internally`() {
        val a = capture(id = "cap-1")
        val txnA = pendingCaptureToTxnCandidate(a, categories, emptyList())!!
        val byHash = predictBatchHashes(listOf(a to txnA))

        val independentlyComputedGroupKey = dedupeGroupKey(
            DedupeFields(txnA.date, txnA.amountCents, txnA.description, txnA.account),
        )
        val independentlyComputedHash = hashTxn(txnA.date, txnA.amountCents, txnA.description, txnA.account, 0)
        assertTrue(independentlyComputedGroupKey.isNotEmpty())
        assertEquals(a, byHash[independentlyComputedHash])
    }

    @Test
    fun `matchWrittenCaptures pairs inserted rows back to the capture each one came from`() {
        val a = capture(id = "cap-1", merchant = "campos coffee")
        val b = capture(id = "cap-2", merchant = "woolworths", amountCents = 4200L)
        val txnA = pendingCaptureToTxnCandidate(a, categories, emptyList())!!
        val txnB = pendingCaptureToTxnCandidate(b, categories, emptyList())!!
        val pairs = listOf(a to txnA, b to txnB)

        // Simulate what VaultRepository.addTxns actually returns: the same
        // rows, with a freshly assigned id and the real computed hash --
        // never the placeholder id/hash pendingCaptureToTxnCandidate set.
        val insertedA = txnA.copy(id = "real-id-1", hash = hashTxn(txnA.date, txnA.amountCents, txnA.description, txnA.account, 0))
        val insertedB = txnB.copy(id = "real-id-2", hash = hashTxn(txnB.date, txnB.amountCents, txnB.description, txnB.account, 0))

        val written = matchWrittenCaptures(pairs, listOf(insertedA, insertedB))

        assertEquals(setOf(a, b), written.toSet())
    }

    @Test
    fun `a capture addTxns silently dropped as a duplicate is absent from the result -- stays pending, not lost`() {
        val a = capture(id = "cap-1")
        val b = capture(id = "cap-2", merchant = "woolworths", amountCents = 4200L)
        val txnA = pendingCaptureToTxnCandidate(a, categories, emptyList())!!
        val txnB = pendingCaptureToTxnCandidate(b, categories, emptyList())!!
        val pairs = listOf(a to txnA, b to txnB)

        // Only B was actually inserted -- A was treated as an existing
        // duplicate and never appears in what addTxns returns.
        val insertedB = txnB.copy(id = "real-id-2", hash = hashTxn(txnB.date, txnB.amountCents, txnB.description, txnB.account, 0))

        val written = matchWrittenCaptures(pairs, listOf(insertedB))

        assertEquals(listOf(b), written)
    }
}
