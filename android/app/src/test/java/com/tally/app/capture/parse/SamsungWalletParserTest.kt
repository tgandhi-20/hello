package com.tally.app.capture.parse

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class SamsungWalletParserTest {

    @Test
    fun `never assigns an account -- the notification alone doesn't say which card`() {
        assertNull(SamsungWalletParser.accountId)
    }

    @Test
    fun `normal tap confirmation`() {
        val result = SamsungWalletParser.parse("You paid \$5.50 at CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
        assertFalse(result.isCredit)
    }

    @Test
    fun `alternate approved phrasing`() {
        val result = SamsungWalletParser.parse("Payment of \$5.50 approved at CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
    }

    @Test
    fun `amount with a thousands separator`() {
        val result = SamsungWalletParser.parse("You paid \$3,400.20 at HARVEY NORMAN")
        requireNotNull(result)
        assertEquals(340020L, result.amountCents)
    }

    @Test
    fun `merchant text containing the word 'at'`() {
        val result = SamsungWalletParser.parse("You paid \$5.50 at Eat At Joe's")
        requireNotNull(result)
        assertEquals("Eat At Joe's", result.merchant)
    }

    @Test
    fun `unrecognised text is dropped, never guessed`() {
        assertNull(SamsungWalletParser.parse("Add a new card to your wallet"))
    }
}
