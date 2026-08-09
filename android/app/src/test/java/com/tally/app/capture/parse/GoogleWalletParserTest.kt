package com.tally.app.capture.parse

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class GoogleWalletParserTest {

    @Test
    fun `never assigns an account -- the notification alone doesn't say which card`() {
        assertNull(GoogleWalletParser.accountId)
    }

    @Test
    fun `normal tap confirmation`() {
        val result = GoogleWalletParser.parse("You paid \$5.50 to CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
        assertFalse(result.isCredit)
    }

    @Test
    fun `alternate paid phrasing`() {
        val result = GoogleWalletParser.parse("Paid \$5.50 at CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
    }

    @Test
    fun `dot-separated amount and merchant`() {
        val result = GoogleWalletParser.parse("\$5.50 · CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
    }

    @Test
    fun `amount with a thousands separator`() {
        val result = GoogleWalletParser.parse("You paid \$1,050.00 to HARVEY NORMAN")
        requireNotNull(result)
        assertEquals(105000L, result.amountCents)
    }

    @Test
    fun `merchant text containing the word 'at'`() {
        val result = GoogleWalletParser.parse("You paid \$5.50 to Eat At Joe's")
        requireNotNull(result)
        assertEquals("Eat At Joe's", result.merchant)
    }

    @Test
    fun `unrecognised text is dropped, never guessed`() {
        assertNull(GoogleWalletParser.parse("Your boarding pass is ready"))
    }
}
