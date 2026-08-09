package com.tally.app.capture.review

import com.tally.app.capture.dedupe.CaptureDedupeHash
import com.tally.app.capture.store.CaptureBuffer
import com.tally.app.capture.util.CaptureDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Reference [CaptureReviewQueue] implementation. Pure Kotlin apart from
 * [buffer] and [notificationAccessGranted] (both injected as interfaces/lambdas),
 * so it is fully covered by local JUnit tests against an in-memory
 * [CaptureBuffer] fake and stub [LedgerHashLookup]/[AcceptedCaptureWriter] --
 * see `src/test/.../capture/review/`.
 */
class CaptureReviewQueueImpl(
    private val buffer: CaptureBuffer,
    private val ledgerHashLookup: LedgerHashLookup,
    private val writer: AcceptedCaptureWriter,
    private val notificationAccessGranted: () -> Boolean
) : CaptureReviewQueue {

    private val _state = MutableStateFlow(CaptureReviewState())
    override val state: StateFlow<CaptureReviewState> = _state.asStateFlow()
    private val mutex = Mutex()

    override suspend fun refresh() {
        _state.value = CaptureReviewState(
            pending = buffer.pendingItems(),
            droppedCount = buffer.droppedCount(),
            notificationAccessGranted = notificationAccessGranted()
        )
    }

    override suspend fun accept(id: String, chosenAccount: String?): CaptureOutcome {
        // Explicit `CaptureOutcome` type argument: this lambda has several early
        // `return@withLock` points returning different CaptureOutcome subtypes
        // (NotFound, NeedsAccount, AlreadyInLedger) plus a final Written/Failed
        // expression -- spelling out the target type here removes any reliance
        // on Kotlin inferring the right common supertype across all of them.
        val outcome = mutex.withLock<CaptureOutcome> {
            val capture = buffer.pendingItems().find { it.id == id }
                ?: return@withLock CaptureOutcome.NotFound

            val account = chosenAccount ?: capture.account
            if (account == null) return@withLock CaptureOutcome.NeedsAccount(capture)

            val resolved = if (capture.dedupeHash == null || chosenAccount != null) {
                val dateStr = CaptureDate.localDateString(capture.postedAt)
                capture.copy(account = account, dedupeHash = CaptureDedupeHash.compute(dateStr, capture.amountCents, capture.merchant, account))
            } else {
                capture
            }

            val hash = resolved.dedupeHash
            if (hash != null && ledgerHashLookup.containsHash(hash)) {
                buffer.removePending(id)
                return@withLock CaptureOutcome.AlreadyInLedger(resolved)
            }

            try {
                if (writer.write(resolved)) {
                    buffer.removePending(id)
                    CaptureOutcome.Written(resolved)
                } else {
                    CaptureOutcome.Failed(resolved, "the ledger declined to write this transaction")
                }
            } catch (e: Exception) {
                CaptureOutcome.Failed(resolved, e.message ?: "unknown error")
            }
        }
        refresh()
        return outcome
    }

    override suspend fun acceptAll(): List<CaptureOutcome> {
        val ids = buffer.pendingItems().map { it.id }
        return ids.map { accept(it) }
    }

    override suspend fun dismiss(id: String) {
        mutex.withLock { buffer.removePending(id) }
        refresh()
    }

    override suspend fun dismissAll(ids: Collection<String>) {
        mutex.withLock { ids.forEach { buffer.removePending(it) } }
        refresh()
    }
}
