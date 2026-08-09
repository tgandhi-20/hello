package com.tally.app.capture.ingest

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.tally.app.capture.parse.CapturePackages
import com.tally.app.capture.store.SecureCaptureStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Binds to the system `NotificationManager` (per the manifest's
 * `BIND_NOTIFICATION_LISTENER_SERVICE` service declaration) and feeds every
 * notification from a whitelisted package (`CapturePackages.whitelist`) into
 * [CaptureIngestPipeline].
 *
 * Deliberately as thin as possible: no parsing, dedupe or sign logic lives
 * here (that's [CaptureIngestPipeline] and the `capture.parse`/`capture.dedupe`
 * packages, all pure Kotlin and unit tested) -- this file only translates
 * Android's callback shape into that pipeline's plain arguments. It is also
 * the one part of this whole module that genuinely cannot be exercised by a
 * local JUnit test: `StatusBarNotification` and `Notification` need a real
 * Android runtime to construct meaningfully, which this build environment
 * does not have (see the project's top-level "cannot compile or run locally"
 * note) -- CI's `assembleDebug`/`testDebugUnitTest` steps are what actually
 * prove this class compiles and binds correctly against the real APIs.
 *
 * Never logs notification text, an amount or a merchant -- not even at debug
 * level (CONTRACTS.md §5 / ANDROID.md §3). There is no `Log.*` call anywhere
 * in this class or anything it calls.
 */
class CaptureNotificationListenerService : NotificationListenerService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val buffer by lazy { SecureCaptureStorage(applicationContext) }

    override fun onListenerConnected() {
        super.onListenerConnected()
        // The listener can (re)connect well after notifications were first
        // posted -- OS rebind, the device leaving Doze, this app being
        // updated. Replaying what's currently on the shade means nothing
        // posted while disconnected is silently missed. The pipeline's
        // notification-signature dedupe (see `CaptureIngestPipeline`) is what
        // makes replaying something already captured in an earlier connection
        // a safe no-op rather than a double count.
        serviceScope.launch {
            runCatching { activeNotifications }.getOrNull()?.forEach { handle(it) }
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        serviceScope.launch { handle(sbn) }
    }

    private suspend fun handle(sbn: StatusBarNotification) {
        val parser = CapturePackages.parserFor(sbn.packageName) ?: return // not a whitelisted source

        if (sbn.isOngoing) return // foreground/ongoing notifications are never a one-off transaction

        val notification = sbn.notification ?: return
        if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return // group summaries carry no transaction of their own

        val extras = notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?.takeIf { it.isNotBlank() }
            ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()

        CaptureIngestPipeline.ingest(
            buffer = buffer,
            packageName = sbn.packageName,
            parser = parser,
            notificationKey = sbn.key,
            postedAtMillis = sbn.postTime,
            title = title,
            text = text
        )
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }
}
