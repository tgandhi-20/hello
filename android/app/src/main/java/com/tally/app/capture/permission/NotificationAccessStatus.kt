package com.tally.app.capture.permission

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/**
 * Notification-listener access cannot be granted programmatically -- there is
 * no runtime permission dialog for it, only a trip to Android's own settings
 * screen (`ACTION_NOTIFICATION_LISTENER_SETTINGS`, available since API 22,
 * well below this project's minSdk 26). This object is the two things that
 * trip needs: detecting whether access is currently granted, and the intent
 * that opens the settings screen.
 */
object NotificationAccessStatus {

    /**
     * True if this app's [com.tally.app.capture.ingest.CaptureNotificationListenerService]
     * is currently an enabled notification listener. Backed by
     * `NotificationManagerCompat` (already a transitive dependency via
     * `androidx.core:core-ktx`, which this module was built against) rather
     * than reading `Settings.Secure`'s `enabled_notification_listeners` string
     * directly -- same information, no need to hand-parse a colon-delimited
     * component-name list.
     */
    fun isGranted(context: Context): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    /** Opens Android's "Notification access" settings screen, where the user grants or revokes this app. */
    fun settingsIntent(): Intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
}
