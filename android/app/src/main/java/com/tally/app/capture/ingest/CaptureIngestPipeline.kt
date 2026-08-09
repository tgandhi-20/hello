package com.tally.app.capture.ingest

import com.tally.app.capture.dedupe.CaptureDedupeHash
import com.tally.app.capture.dedupe.CaptureSignature
import com.tally.app.capture.model.PendingCapture
import com.tally.app.capture.parse.BankNotificationParser
import com.tally.app.capture.store.CaptureBuffer
import com.tally.app.capture.util.CaptureDate

/**
 * The actual capture logic: signature dedupe, parsing, sign resolution, hash
 * computation. Pure Kotlin -- takes a [CaptureBuffer] and plain values, no
 * `android.*` types -- so it is fully covered by local JUnit tests against an
 * in-memory fake buffer, independent of
 * [com.tally.app.capture.ingest.CaptureNotificationListenerService] (which is
 * the thin, untestable-without-a-device wiring around this).
 */
object CaptureIngestPipeline {

    suspend fun ingest(
        buffer: CaptureBuffer,
        packageName: String,
        parser: BankNotificationParser,
        notificationKey: String?,
        postedAtMillis: Long,
        title: String,
        text: String
    ): IngestResult {
        if (text.isBlank()) {
            buffer.incrementDropped()
            return IngestResult.Dropped
        }

        // Notification-identity dedupe FIRST, before any parsing: a repost of
        // a notification this pipeline already handled -- whether a genuine
        // OS-level redelivery or the listener replaying `activeNotifications`
        // on reconnect -- must not be parsed a second time, successfully or
        // not, and must not bump the dropped counter either.
        val signature = CaptureSignature.of(packageName, notificationKey, postedAtMillis, title, text)
        if (buffer.hasSeenSignature(signature)) {
            return IngestResult.DuplicateIgnored
        }
        buffer.recordSignature(signature)

        val parsed = parser.parse(text)
        if (parsed == null) {
            buffer.incrementDropped()
            return IngestResult.Dropped
        }

        val dateStr = CaptureDate.localDateString(postedAtMillis)
        val amountCents = if (parsed.isCredit) -parsed.amountCents else parsed.amountCents
        val account = parser.accountId

        val dedupeHash = if (account != null) {
            val existing = buffer.pendingItems()
            val occurrence = CaptureDedupeHash.assignOccurrence(existing, dateStr, amountCents, parsed.merchant, account)
            CaptureDedupeHash.compute(dateStr, amountCents, parsed.merchant, account, occurrence)
        } else {
            // Account unknown (wallet tap) -- the hash needs an account, so it
            // is computed later, once the user picks one at accept time. See
            // `PendingCapture.dedupeHash`'s doc comment.
            null
        }

        val item = PendingCapture(
            id = signature,
            packageName = packageName,
            account = account,
            amountCents = amountCents,
            merchant = parsed.merchant,
            rawText = text,
            postedAt = postedAtMillis,
            dedupeHash = dedupeHash
        )
        buffer.addPending(item)
        return IngestResult.Captured(item)
    }
}

sealed class IngestResult {
    data class Captured(val item: PendingCapture) : IngestResult()
    object Dropped : IngestResult()
    object DuplicateIgnored : IngestResult()
}
