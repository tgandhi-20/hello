package com.tally.app.ui.txndetail

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/**
 * These target the pure functions in `TxnDetailScreen.kt` directly — no
 * Compose involved, matching every other agent's `src/test/` suite (there
 * is no Compose UI testing dependency in this build, per `app/build.gradle.kts`).
 */
class TxnDetailScreenTest {

    @Test
    fun `formatDetailDate reads day month year`() {
        assertEquals("12 Aug 2026", formatDetailDate(LocalDate.of(2026, 8, 12)))
        assertEquals("1 Jan 2027", formatDetailDate(LocalDate.of(2027, 1, 1)))
    }

    @Test
    fun `accountDisplayText resolves a known account id to its real display name`() {
        assertEquals("Amex", accountDisplayText("amex"))
        assertEquals("CBA card", accountDisplayText("cba-card"))
    }

    @Test
    fun `accountDisplayText falls back to the raw id when it does not resolve to a known account`() {
        assertEquals("mystery-bank", accountDisplayText("mystery-bank"))
    }

    @Test
    fun `accountDisplayText is null when there is no id at all, never a blank row`() {
        assertNull(accountDisplayText(null))
        assertNull(accountDisplayText("  "))
    }
}
