package com.tally.app.capture.review

import com.tally.app.capture.dedupe.CaptureDedupeHash
import com.tally.app.capture.model.AccountIds
import com.tally.app.capture.model.PendingCapture
import com.tally.app.capture.testutil.FakeCaptureBuffer
import com.tally.app.capture.util.CaptureDate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureReviewQueueImplTest {

    private val postedAt = 1_754_722_800_000L

    private fun bankCapture(id: String = "cap-1", amountCents: Long = 550L, merchant: String = "Campos Coffee"): PendingCapture {
        val date = CaptureDate.localDateString(postedAt)
        return PendingCapture(
            id = id,
            packageName = "com.commbank.netbank",
            account = AccountIds.CBA,
            amountCents = amountCents,
            merchant = merchant,
            rawText = "You spent \$5.50 at Campos Coffee",
            postedAt = postedAt,
            dedupeHash = CaptureDedupeHash.compute(date, amountCents, merchant, AccountIds.CBA)
        )
    }

    private fun walletCapture(id: String = "cap-wallet"): PendingCapture = PendingCapture(
        id = id,
        packageName = "com.google.android.apps.walletnfcrel",
        account = null,
        amountCents = 550L,
        merchant = "Campos Coffee",
        rawText = "You paid \$5.50 to Campos Coffee",
        postedAt = postedAt,
        dedupeHash = null
    )

    /**
     * Records every batch it is handed, not just every item, so a test can
     * assert that `acceptAll` writes ONCE rather than once per item — which
     * is the whole point of the batch path (see [AcceptedCaptureWriter]).
     */
    private class RecordingWriter(private val succeed: Boolean = true) : AcceptedCaptureWriter {
        val written = mutableListOf<PendingCapture>()
        val batches = mutableListOf<List<PendingCapture>>()
        override suspend fun writeBatch(captures: List<PendingCapture>): List<PendingCapture> {
            batches.add(captures)
            written.addAll(captures)
            return if (succeed) captures else emptyList()
        }
    }

    @Test
    fun `accepting a normal item writes it through and clears it from the buffer`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture())
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        val outcome = queue.accept("cap-1")

        assertTrue(outcome is CaptureOutcome.Written)
        assertEquals(1, writer.written.size)
        assertTrue(buffer.pendingItems().isEmpty())
    }

    @Test
    fun `an item already in the ledger by hash is cleared without writing again`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture())
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { true }, writer) { true }

        val outcome = queue.accept("cap-1")

        assertTrue(outcome is CaptureOutcome.AlreadyInLedger)
        assertEquals(0, writer.written.size)
        assertTrue(buffer.pendingItems().isEmpty())
    }

    @Test
    fun `a failed write leaves the item in the buffer -- nothing captured is lost`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture())
        val writer = RecordingWriter(succeed = false)
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        val outcome = queue.accept("cap-1")

        assertTrue(outcome is CaptureOutcome.Failed)
        assertEquals(1, buffer.pendingItems().size)
    }

    @Test
    fun `a wallet item with no account needs one before it can be accepted`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(walletCapture())
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        val outcome = queue.accept("cap-wallet")

        assertTrue(outcome is CaptureOutcome.NeedsAccount)
        assertEquals(0, writer.written.size)
        assertEquals(1, buffer.pendingItems().size) // still waiting, nothing lost
    }

    @Test
    fun `supplying a chosen account resolves a wallet item and writes it`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(walletCapture())
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        val outcome = queue.accept("cap-wallet", chosenAccount = AccountIds.AMEX)

        assertTrue(outcome is CaptureOutcome.Written)
        val written = writer.written.single()
        assertEquals(AccountIds.AMEX, written.account)
        assertTrue(written.dedupeHash != null)
    }

    @Test
    fun `dismissing an item clears it without ever calling the writer`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture())
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        queue.dismiss("cap-1")

        assertEquals(0, writer.written.size)
        assertTrue(buffer.pendingItems().isEmpty())
    }

    @Test
    fun `accepting an unknown id is reported, not thrown`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, RecordingWriter()) { true }

        val outcome = queue.accept("does-not-exist")

        assertTrue(outcome is CaptureOutcome.NotFound)
    }

    /**
     * The regression this batch path exists for.
     *
     * Two identical $5.50 coffees at the same cafe on the same day on the
     * same card are two real purchases, not one seen twice. The old
     * `acceptAll` looped single writes, and a per-item ledger write assigns
     * occurrence 0 every time because it cannot see the rest of the batch —
     * so the two hashed identically and the second was discarded as a
     * duplicate. Real money, gone, silently.
     *
     * Asserting on the batch (one call carrying both) rather than only on the
     * item count is deliberate: a loop of single writes would also produce
     * two `Written` outcomes here, so a count-only assertion passes on the
     * broken implementation and proves nothing.
     */
    @Test
    fun `acceptAll hands two identical same-day captures to the ledger as one batch`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture(id = "cap-1", amountCents = 550L, merchant = "Campos Coffee"))
        buffer.addPending(bankCapture(id = "cap-2", amountCents = 550L, merchant = "Campos Coffee"))
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        val outcomes = queue.acceptAll()

        assertEquals(1, writer.batches.size)
        assertEquals(2, writer.batches[0].size)
        assertEquals(2, outcomes.count { it is CaptureOutcome.Written })
        assertEquals(0, buffer.pendingItems().size)
    }

    /**
     * A batch the ledger refuses must leave everything pending. Nothing
     * captured is ever silently lost — the user can retry.
     */
    @Test
    fun `a failed batch write leaves every item pending`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture(id = "cap-1", merchant = "Campos Coffee"))
        buffer.addPending(bankCapture(id = "cap-2", amountCents = 1200L, merchant = "Woolworths"))
        val queue = CaptureReviewQueueImpl(
            buffer, LedgerHashLookup { false }, RecordingWriter(succeed = false)
        ) { true }

        val outcomes = queue.acceptAll()

        assertEquals(2, outcomes.count { it is CaptureOutcome.Failed })
        assertEquals(2, buffer.pendingItems().size)
    }

    @Test
    fun `acceptAll writes every pending item and skips none that already have an account`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.addPending(bankCapture(id = "cap-1", merchant = "Campos Coffee"))
        buffer.addPending(bankCapture(id = "cap-2", amountCents = 1200L, merchant = "Woolworths"))
        val writer = RecordingWriter()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, writer) { true }

        val outcomes = queue.acceptAll()

        assertEquals(2, outcomes.size)
        assertTrue(outcomes.all { it is CaptureOutcome.Written })
        assertTrue(buffer.pendingItems().isEmpty())
    }

    @Test
    fun `refresh reflects notification access status and dropped count`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        buffer.incrementDropped()
        buffer.incrementDropped()
        val queue = CaptureReviewQueueImpl(buffer, LedgerHashLookup { false }, RecordingWriter()) { false }

        queue.refresh()

        assertEquals(2, queue.state.value.droppedCount)
        assertEquals(false, queue.state.value.notificationAccessGranted)
        assertNull(queue.state.value.pending.firstOrNull())
    }
}
