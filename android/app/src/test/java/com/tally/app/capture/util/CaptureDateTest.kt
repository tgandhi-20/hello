package com.tally.app.capture.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZoneOffset

class CaptureDateTest {

    @Test
    fun `formats as YYYY-MM-DD matching DateStr`() {
        // 2026-08-09T10:15:00Z
        val epochMillis = 1786270500000L
        assertEquals("2026-08-09", CaptureDate.localDateString(epochMillis, ZoneOffset.UTC))
    }

    @Test
    fun `respects the supplied time zone, not just UTC`() {
        // 2026-08-09T23:30:00Z is already 2026-08-10 13:30 in UTC+14.
        val epochMillis = 1786318200000L
        assertEquals("2026-08-10", CaptureDate.localDateString(epochMillis, ZoneId.of("Pacific/Kiritimati")))
    }
}
