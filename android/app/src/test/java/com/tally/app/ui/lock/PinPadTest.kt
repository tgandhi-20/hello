package com.tally.app.ui.lock

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * `applyPinKey` is pure Kotlin (no Android/Compose dependency), so it runs
 * on the host JVM without an emulator, same as `ui/model/Keypad.kt`'s
 * `applyKeypadKey` tests.
 */
class PinPadTest {

    @Test
    fun `digits append in order`() {
        var buffer = ""
        buffer = applyPinKey(buffer, "1")
        buffer = applyPinKey(buffer, "2")
        buffer = applyPinKey(buffer, "3")
        assertEquals("123", buffer)
    }

    @Test
    fun `backspace removes the last digit and never goes negative-length`() {
        assertEquals("12", applyPinKey("123", "back"))
        assertEquals("", applyPinKey("", "back"))
    }

    @Test
    fun `buffer never grows past the configured max length`() {
        val maxed = "1".repeat(10)
        assertEquals(maxed, applyPinKey(maxed, "9", maxLength = 10))
    }

    @Test
    fun `a custom max length is honoured, such as a shorter unlock PIN`() {
        assertEquals("1234", applyPinKey("123", "4", maxLength = 4))
        assertEquals("1234", applyPinKey("1234", "5", maxLength = 4))
    }

    @Test
    fun `non-digit, non-back keys are ignored rather than corrupting the buffer`() {
        assertEquals("12", applyPinKey("12", "."))
        assertEquals("12", applyPinKey("12", ""))
    }
}
