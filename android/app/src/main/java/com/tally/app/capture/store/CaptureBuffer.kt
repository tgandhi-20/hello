package com.tally.app.capture.store

import com.tally.app.capture.model.PendingCapture

/**
 * The persistence contract the pure capture pipeline and review queue need.
 * Deliberately plain Kotlin -- no `android.*` types anywhere in this file --
 * so both sides can be exercised by a local JUnit test against an in-memory
 * fake, independent of [SecureCaptureStorage]'s real, Android/Keystore-backed
 * implementation (which local unit tests cannot meaningfully exercise: no
 * Android runtime is present, see that class's doc comment).
 */
interface CaptureBuffer {
    /** Everything currently waiting for review, in insertion order. */
    suspend fun pendingItems(): List<PendingCapture>

    suspend fun addPending(item: PendingCapture)

    /** No-op if `id` is not present -- accepting/dismissing an already-cleared item is not an error. */
    suspend fun removePending(id: String)

    /** Notifications seen but not parsed cleanly, counted, never guessed into a transaction. */
    suspend fun droppedCount(): Int

    suspend fun incrementDropped()

    /** True if [recordSignature] has already been called with this exact signature. */
    suspend fun hasSeenSignature(signature: String): Boolean

    suspend fun recordSignature(signature: String)
}
