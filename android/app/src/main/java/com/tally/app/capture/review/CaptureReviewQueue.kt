package com.tally.app.capture.review

import com.tally.app.capture.model.PendingCapture
import kotlinx.coroutines.flow.StateFlow

/**
 * What the capture module needs from the real ledger to avoid a transaction
 * landing twice -- once captured from a notification, once later imported
 * from a CSV statement. Implemented by whichever agent owns the real store
 * (`data/**`); this module only calls it, never implements ledger lookups
 * itself. See `CaptureDedupeHash`'s doc comment for the honest limits of what
 * this can actually catch.
 */
fun interface LedgerHashLookup {
    /** True if a transaction with this exact dedupe hash already exists in the ledger. */
    suspend fun containsHash(hash: String): Boolean
}

/**
 * Where an accepted capture is actually written -- "the normal store path"
 * (ANDROID.md §3). Implemented by whichever agent owns `addTxn`/its native
 * equivalent (`com.tally.app.data.VaultRepository`, if that module's current
 * shape holds). [CaptureReviewQueue] calls this exactly once per accept and
 * only clears its own buffer entry on success (`true`/no exception); a
 * failure leaves the item pending so nothing captured is ever silently lost.
 *
 * ## An integration nuance worth the implementer's attention
 *
 * `VaultRepository.addTxn` (singular) recomputes its own dedupe hash with
 * `occurrence` fixed at `0` -- it has no way to know this capture is the
 * second of two otherwise-identical items also waiting in this same review
 * batch, the way `CaptureDedupeHash.assignOccurrence` (scoped to this
 * module's pending buffer) does. For the common case -- accepting one item at
 * a time, or a batch with no two items sharing the exact same
 * date/amount/merchant/account -- this is a non-issue. For the narrow case of
 * bulk-accepting two *genuinely distinct* same-day identical-looking captures
 * together (two identical coffees), wiring this against `addTxn` per item
 * risks the ledger assigning both the same occurrence-0 hash. Wiring it
 * against `VaultRepository.addTxns` (the batch method CSV import already
 * uses, which assigns occurrence within whatever list it's given) for the
 * whole `acceptAll()` batch at once avoids that -- worth doing when this is
 * actually wired up, flagged here rather than guessed at unilaterally since
 * `data/**` isn't this module's to change.
 */
fun interface AcceptedCaptureWriter {
    /** Returns `true` on a successful write. Throwing is also treated as a failure. */
    suspend fun write(capture: PendingCapture): Boolean
}

data class CaptureReviewState(
    val pending: List<PendingCapture> = emptyList(),
    /** Notifications seen but not parsed cleanly, counted, never guessed into a transaction. */
    val droppedCount: Int = 0,
    val notificationAccessGranted: Boolean = false
)

sealed class CaptureOutcome {
    data class Written(val capture: PendingCapture) : CaptureOutcome()
    /** The exact same transaction (by dedupe hash) was already in the ledger -- silently cleared, not double-written. */
    data class AlreadyInLedger(val capture: PendingCapture) : CaptureOutcome()
    /** Write failed or threw. The item is left in the buffer -- nothing captured is lost. */
    data class Failed(val capture: PendingCapture, val reason: String) : CaptureOutcome()
    /** [PendingCapture.account] is `null` (a wallet tap) and no `chosenAccount` was supplied -- the UI must ask which card. */
    data class NeedsAccount(val capture: PendingCapture) : CaptureOutcome()
    /** `id` was not in the buffer -- already accepted/dismissed elsewhere. Not an error. */
    object NotFound : CaptureOutcome()
}

/**
 * The plain interface the UI layer mounts. Nothing in this module writes UI
 * outside `capture/**` -- a screen owned by another agent (or `ui/**` once it
 * exists) can hold an instance of this and render `state` however it likes;
 * `CaptureReviewScreen` in this same package is a ready-made Compose
 * implementation of that rendering, offered as a starting point rather than
 * the only option.
 */
interface CaptureReviewQueue {
    val state: StateFlow<CaptureReviewState>

    /** Re-reads the buffer and notification-access status from disk/system. Call on screen entry/resume. */
    suspend fun refresh()

    /**
     * Accept one item. `chosenAccount` is required exactly when the item's own
     * `account` is `null` (a wallet tap -- see [CaptureOutcome.NeedsAccount]);
     * passing it for any item overrides that item's account before writing.
     */
    suspend fun accept(id: String, chosenAccount: String? = null): CaptureOutcome

    /** Accepts every currently pending item, in order. Items needing an account (see [CaptureOutcome.NeedsAccount]) are skipped, not guessed. */
    suspend fun acceptAll(): List<CaptureOutcome>

    /** Dismiss one item without writing it anywhere. */
    suspend fun dismiss(id: String)

    suspend fun dismissAll(ids: Collection<String>)
}
