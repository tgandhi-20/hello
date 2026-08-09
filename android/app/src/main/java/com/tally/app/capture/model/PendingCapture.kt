package com.tally.app.capture.model

/**
 * One notification that parsed cleanly enough to show the user, waiting in the
 * encrypted buffer for them to accept or dismiss it. Never written to any
 * ledger on its own -- see `capture.review.CaptureReviewQueue`.
 *
 * Mirrors the meaning of `Cents`/`AccountId` in `src/types.ts` exactly (integer
 * cents, positive = spend, negative = refund/credit) so that whatever the real
 * ledger's `Txn` type turns out to be, mapping one of these onto it is a
 * straight field copy, not a reinterpretation.
 */
data class PendingCapture(
    /**
     * Stable per real-world notification event -- a hash of package name,
     * Android's own notification key, post time, title and text (see
     * `capture.dedupe.CaptureSignature`). Reposting the exact same notification
     * produces the exact same id, which is what lets the ingest pipeline
     * recognise "already captured this one" and skip it instead of double
     * counting.
     */
    val id: String,
    /** The whitelisted package this notification came from. Never logged elsewhere; fine here since this type never reaches a log call. */
    val packageName: String,
    /**
     * One of [AccountIds], or `null` when the source notification does not say
     * which underlying card was used (Google Wallet / Samsung Wallet tap
     * confirmations -- see the parsers for those packages). `null` is never
     * guessed away: `CaptureReviewQueue.accept` requires the caller to supply
     * one before this can be written anywhere.
     */
    val account: String?,
    /** Positive = money out (spend). Negative = money in (refund/credit). Integer cents, never a float. */
    val amountCents: Long,
    /** Merchant text extracted from the notification, trimmed but otherwise verbatim. */
    val merchant: String,
    /** The original notification text, unmodified, so the user can check the parse against it before accepting. */
    val rawText: String,
    /** `StatusBarNotification.postTime` -- epoch milliseconds. */
    val postedAt: Long,
    /**
     * `sha256(date|amountCents|normalisedDescription|account|occurrence)` --
     * `src/data/dedupe.ts`'s formula, ported bit-for-bit in
     * `capture.dedupe.CaptureDedupeHash`. `null` exactly when [account] is
     * `null`, since the formula needs an account; computed the moment an
     * account is supplied (capture time for bank apps, accept time for
     * wallet taps once the user picks a card).
     */
    val dedupeHash: String?
)
