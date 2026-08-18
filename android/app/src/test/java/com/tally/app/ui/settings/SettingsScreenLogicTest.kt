package com.tally.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure Kotlin coverage for the small bits of `SettingsScreen.kt` that don't
 * need Compose/Android to exercise -- the auto-lock preset list and its
 * label lookup. Everything else in that file is Compose UI wired directly
 * to `VaultRepository` (a real `Context`/Room/Keystore-backed class), which
 * a local unit test cannot meaningfully construct -- see `VaultCaptureBridge`'s
 * doc comment (`ui/capture/`) for the same constraint applied there.
 */
class SettingsScreenLogicTest {

    @Test
    fun `every preset maps back to its own label`() {
        for ((label, ms) in AUTO_LOCK_OPTIONS) {
            assertEquals(label, autoLockLabel(ms))
        }
    }

    @Test
    fun `an unrecognised value falls back to the 2-minute label rather than showing nothing`() {
        assertEquals("2 minutes", autoLockLabel(999L))
    }

    @Test
    fun `presets are listed shortest to longest`() {
        val values = AUTO_LOCK_OPTIONS.map { it.second }
        assertEquals(values.sorted(), values)
    }

    @Test
    fun `no duplicate timeout values`() {
        val values = AUTO_LOCK_OPTIONS.map { it.second }
        assertTrue(values.size == values.toSet().size)
    }

    @Test
    fun `sanitizeAmountInput strips everything but digits and dots`() {
        assertEquals("6457.00", sanitizeAmountInput("\$6,457.00"))
        assertEquals("350000", sanitizeAmountInput("350000"))
    }

    @Test
    fun `sanitizeAmountInput keeps only the first dot`() {
        assertEquals("1.23", sanitizeAmountInput("1.2.3"))
        assertEquals("1.", sanitizeAmountInput("1.."))
    }

    @Test
    fun `sanitizeAmountInput caps decimal digits at 2`() {
        assertEquals("1.23", sanitizeAmountInput("1.239"))
    }

    @Test
    fun `sanitizeAmountInput caps whole-dollar digits at 6`() {
        assertEquals("999999", sanitizeAmountInput("9999999"))
    }

    @Test
    fun `sanitizeAmountInput on empty input is empty`() {
        assertEquals("", sanitizeAmountInput(""))
    }
}
