package com.tally.app.capture.dedupe

/**
 * Identity for "this exact notification, as posted" -- independent of whether
 * it parses into a transaction at all. Used to satisfy deliverable 1's "handle
 * the same notification being posted twice": banks and the notification
 * listener's own `onListenerConnected()` replay of `activeNotifications` (see
 * `CaptureNotificationListenerService`) can both hand the pipeline the same
 * notification more than once, and neither should be parsed or counted twice.
 *
 * Deliberately content-based (package, Android's own notification key, post
 * time, title, text) rather than object-identity based, and deliberately not
 * the same thing as [CaptureDedupeHash]'s ledger-dedupe hash: this one is
 * about *notification* identity, that one is about *transaction* identity. A
 * bank correcting a mis-posted amount and re-sending would get a new signature
 * here (different text) but the same date/amount/account group key there only
 * if the corrected amount happens to match another pending item -- unrelated
 * concerns, deliberately kept apart.
 */
object CaptureSignature {
    fun of(packageName: String, notificationKey: String?, postedAtMillis: Long, title: String, text: String): String =
        Sha256.hex("$packageName|${notificationKey.orEmpty()}|$postedAtMillis|$title|$text")
}
