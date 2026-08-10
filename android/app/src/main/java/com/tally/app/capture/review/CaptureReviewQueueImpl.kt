package com.tally.app.capture.review

import com.tally.app.capture.dedupe.CaptureDedupeHash
import com.tally.app.capture.model.PendingCapture
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

    /**
     * Accepts every pending item as ONE write, not a loop of single writes.
     *
     * The loop was the bug: each `accept()` calls `writer.write()`
     * separately, and a per-item ledger write assigns occurrence 0 every
     * time, because it cannot see the rest of the batch. Two genuinely
     * distinct same-day identical captures -- two $5.50 coffees on the same
     * card -- then hash identically, and the second is discarded as a
     * duplicate of the first. See [AcceptedCaptureWriter] for the full
     * reasoning.
     *
     * Order of the returned outcomes matches the order of the pending list,
     * so a caller can pair them up positionally.
     */
    override suspend fun acceptAll(): List<CaptureOutcome> {
        val outcomes = mutex.withLock {
            val pending = buffer.pendingItems()

            // Resolve first, decide second. Each item is classified without
            // writing anything, so the batch handed to the ledger contains
            // only items that are genuinely new and genuinely complete.
            val resolvedById = LinkedHashMap<String, PendingCapture>()
            val preOutcomes = LinkedHashMap<String, CaptureOutcome>()

            for (capture in pending) {
                val account = capture.account
                if (account == null) {
                    // Never guessed. A wallet tap does not say which card was
                    // used, and a transaction filed against the wrong account
                    // is a quiet, compounding error in the ledger.
                    preOutcomes[capture.id] = CaptureOutcome.NeedsAccount(capture)
                    continue
                }
                val resolved = if (capture.dedupeHash == null) {
                    val dateStr = CaptureDate.localDateString(capture.postedAt)
                    capture.copy(
                        dedupeHash = CaptureDedupeHash.compute(
                            dateStr, capture.amountCents, capture.merchant, account
                        )
                    )
                } else {
                    capture
                }

                val hash = resolved.dedupeHash
                if (hash != null && ledgerHashLookup.containsHash(hash)) {
                    buffer.removePending(resolved.id)
                    preOutcomes[resolved.id] = CaptureOutcome.AlreadyInLedger(resolved)
                    continue
                }
                resolvedById[resolved.id] = resolved
            }

            val toWrite = resolvedById.values.toList()
            val writtenIds: Set<String>
            var failureMessage: String? = null
            if (toWrite.isEmpty()) {
                writtenIds = emptySet()
            } else {
                writtenIds = try {
                    writer.writeBatch(toWrite).map { it.id }.toSet()
                } catch (e: Exception) {
                    failureMessage = e.message ?: "unknown error"
                    emptySet()
                }
            }

            for (id in writtenIds) buffer.removePending(id)

            // Rebuild in the original pending order so callers can pair
            // outcomes with the list they were showing.
            pending.map { capture ->
                preOutcomes[capture.id]
                    ?: resolvedById[capture.id]?.let { resolved ->
                        if (resolved.id in writtenIds) {
                            CaptureOutcome.Written(resolved)
                        } else {
                            CaptureOutcome.Failed(
                                resolved,
                                failureMessage ?: "the ledger declined to write this transaction"
                            )
                        }
                    }
                    ?: CaptureOutcome.NotFound
            }
        }
        refresh()
        return outcomes
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
