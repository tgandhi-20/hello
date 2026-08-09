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

    private class RecordingWriter(private val succeed: Boolean = true) : AcceptedCaptureWriter {
        val written = mutableListOf<PendingCapture>()
        override suspend fun write(capture: PendingCapture): Boolean {
            written.add(capture)
            return succeed
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
