package com.tally.app.capture.dedupe

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CaptureSignatureTest {

    @Test
    fun `identical notification fields produce the identical signature -- a repost is recognised`() {
        val a = CaptureSignature.of("com.commbank.netbank", "key-1", 1000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        val b = CaptureSignature.of("com.commbank.netbank", "key-1", 1000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        assertEquals(a, b)
    }

    @Test
    fun `a different post time is a different notification`() {
        val a = CaptureSignature.of("com.commbank.netbank", "key-1", 1000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        val b = CaptureSignature.of("com.commbank.netbank", "key-1", 2000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        assertNotEquals(a, b)
    }

    @Test
    fun `a different notification key is a different notification`() {
        val a = CaptureSignature.of("com.commbank.netbank", "key-1", 1000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        val b = CaptureSignature.of("com.commbank.netbank", "key-2", 1000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        assertNotEquals(a, b)
    }

    @Test
    fun `a missing notification key is handled without throwing`() {
        val signature = CaptureSignature.of("com.commbank.netbank", null, 1000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE")
        assertEquals(64, signature.length)
    }
}
