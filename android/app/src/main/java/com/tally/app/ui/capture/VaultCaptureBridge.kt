package com.tally.app.ui.capture

import com.tally.app.capture.model.PendingCapture
import com.tally.app.capture.review.AcceptedCaptureWriter
import com.tally.app.capture.review.LedgerHashLookup
import com.tally.app.data.VaultRepository

/**
 * Wires the capture module's two vault-facing contracts --
 * [LedgerHashLookup] and [AcceptedCaptureWriter] (see
 * `capture/review/CaptureReviewQueue.kt`) -- onto the real
 * [VaultRepository], so `com.tally.app.capture.review.CaptureReviewQueueImpl`
 * actually reaches the ledger instead of sitting unconnected.
 *
 * Deliberately as thin as possible around this package's own
 * `CaptureLedgerMapping.kt` (`pendingCaptureToTxnCandidate`/
 * `matchWrittenCaptures`), which hold all the real
 * mapping/hashing logic and are pure Kotlin, fully covered by local JUnit
 * tests. This class itself cannot be exercised by a local unit test, the
 * same way `com.tally.app.capture.store.SecureCaptureStorage` cannot (see
 * that class's own doc comment): [VaultRepository] has a private
 * constructor, needs a real `Context`, and drives Room plus the Android
 * Keystore -- none of which a local JVM unit test's stub Android jars back
 * with real behaviour. CI's `testDebugUnitTest`/`assembleDebug` are what
 * actually prove this class compiles and wires correctly.
 */
class VaultCaptureBridge(private val repository: VaultRepository) : LedgerHashLookup, AcceptedCaptureWriter {

    override suspend fun containsHash(hash: String): Boolean =
        repository.hydrateAll().txns.any { it.hash == hash }

    /**
     * ONE call to [VaultRepository.addTxns] for the whole batch -- never a
     * loop of single writes. See that function's own doc comment and
     * [AcceptedCaptureWriter]'s for why a per-item write silently drops the
     * second of two genuinely distinct, same-day identical captures (two
     * $5.50 coffees on the same card): a per-item write always assigns
     * dedupe occurrence 0, so the second collides with the first and is
     * discarded as a false duplicate.
     */
    override suspend fun writeBatch(captures: List<PendingCapture>): List<PendingCapture> {
        if (captures.isEmpty()) return emptyList()

        val hydrated = repository.hydrateAll()
        val rules = hydrated.rules
        val pairs = captures.mapNotNull { capture ->
            pendingCaptureToTxnCandidate(capture, hydrated.categories, rules)?.let { capture to it }
        }
        if (pairs.isEmpty()) return emptyList()

        val existingHashes = hydrated.txns.map { it.hash }.toSet()
        val (inserted, _) = repository.addTxns(pairs.map { it.second }, existingHashes)

        return matchWrittenCaptures(pairs, inserted)
    }
}
