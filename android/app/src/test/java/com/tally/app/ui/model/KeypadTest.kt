package com.tally.app.ui.model

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * JVM-testable port of `src/features/log/Keypad.tsx`'s own behaviour —
 * `applyKeypadKey`/`keypadBufferToCents`/`centsToKeypadBuffer` are pure
 * Kotlin with no Android framework dependency, so these run on the host JVM
 * without an emulator, same as every other agent's `src/test/**` suite.
 */
class KeypadTest {

    @Test
    fun digitsAppendInOrder() {
        var buffer = ""
        buffer = applyKeypadKey(buffer, "5")
        buffer = applyKeypadKey(buffer, "5")
        buffer = applyKeypadKey(buffer, "0")
        assertEquals("550", buffer)
    }

    @Test
    fun onlyOneDecimalPointAllowed() {
        var buffer = applyKeypadKey("5", ".")
        buffer = applyKeypadKey(buffer, ".")
        assertEquals("5.", buffer)
    }

    @Test
    fun decimalPartCapsAtTwoDigits() {
        var buffer = "5.5"
        buffer = applyKeypadKey(buffer, "5")
        assertEquals("5.55", buffer)
        buffer = applyKeypadKey(buffer, "5") // third decimal digit — rejected
        assertEquals("5.55", buffer)
    }

    @Test
    fun integerPartCapsAtSixDigits() {
        var buffer = "999999"
        buffer = applyKeypadKey(buffer, "9") // seventh digit — rejected
        assertEquals("999999", buffer)
    }

    @Test
    fun backspaceRemovesLastCharacter() {
        assertEquals("5.5", applyKeypadKey("5.50", "back"))
        assertEquals("", applyKeypadKey("", "back")) // never goes negative-length
    }

    @Test
    fun bufferToCentsHandlesWholeAndFractional() {
        assertEquals(0L, keypadBufferToCents(""))
        assertEquals(0L, keypadBufferToCents("."))
        assertEquals(550L, keypadBufferToCents("5.5"))
        assertEquals(555L, keypadBufferToCents("5.55"))
        assertEquals(50000L, keypadBufferToCents("500"))
        assertEquals(5L, keypadBufferToCents(".05"))
    }

    @Test
    fun bufferToCentsNeverExceedsCeiling() {
        assertEquals(MAX_AMOUNT_CENTS, keypadBufferToCents("999999.99"))
    }

    @Test
    fun centsToBufferRoundTripsThroughBufferToCents() {
        val cents = 12345L
        val buffer = centsToKeypadBuffer(cents)
        assertEquals("123.45", buffer)
        assertEquals(cents, keypadBufferToCents(buffer))
    }

    @Test
    fun centsToBufferHandlesZero() {
        assertEquals("0.00", centsToKeypadBuffer(0L))
    }
}
