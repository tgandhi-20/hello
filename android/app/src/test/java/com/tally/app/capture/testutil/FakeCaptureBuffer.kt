package com.tally.app.capture.testutil

import com.tally.app.capture.model.PendingCapture
import com.tally.app.capture.store.CaptureBuffer

/**
 * In-memory [CaptureBuffer] for tests. Stands in for [com.tally.app.capture.store.SecureCaptureStorage],
 * which cannot be meaningfully exercised by a local JUnit test (see that
 * class's doc comment) -- this fake carries the exact same contract, so
 * everything exercised against it (`CaptureIngestPipeline`, `CaptureReviewQueueImpl`)
 * is testing the real logic, not a shortcut around it.
 */
class FakeCaptureBuffer : CaptureBuffer {
    private val items = mutableListOf<PendingCapture>()
    private val signatures = mutableListOf<String>()
    private var dropped = 0

    override suspend fun pendingItems(): List<PendingCapture> = items.toList()

    override suspend fun addPending(item: PendingCapture) {
        items.add(item)
    }

    override suspend fun removePending(id: String) {
        items.removeAll { it.id == id }
    }

    override suspend fun droppedCount(): Int = dropped

    override suspend fun incrementDropped() {
        dropped++
    }

    override suspend fun hasSeenSignature(signature: String): Boolean = signatures.contains(signature)

    override suspend fun recordSignature(signature: String) {
        if (!signatures.contains(signature)) signatures.add(signature)
    }
}
