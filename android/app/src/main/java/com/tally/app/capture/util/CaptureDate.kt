package com.tally.app.capture.util

import java.time.Instant
import java.time.ZoneId

/**
 * Turns a notification's post time into the `YYYY-MM-DD` local-date string the
 * dedupe hash formula needs (matches `DateStr` in `src/types.ts`).
 *
 * `java.time` is used directly, not a desugaring library: `java.time.*` has
 * shipped as part of the platform since API 26 (Android O), which is exactly
 * this project's `minSdk`, so no `coreLibraryDesugaring` dependency is needed.
 */
object CaptureDate {
    /** `epochMillis` in the device's current local time zone, formatted `YYYY-MM-DD`. */
    fun localDateString(epochMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate().toString()
}
