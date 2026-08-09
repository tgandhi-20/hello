package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AmexParserTest {

    @Test
    fun `maps to the amex account`() {
        assertEquals(AccountIds.AMEX, AmexParser.accountId)
    }

    @Test
    fun `normal purchase`() {
        val result = AmexParser.parse("Your card was charged \$45.00 at WOOLWORTHS")
        requireNotNull(result)
        assertEquals(4500L, result.amountCents)
        assertEquals("WOOLWORTHS", result.merchant)
        assertFalse(result.isCredit)
    }

    @Test
    fun `alternate purchase phrasing`() {
        val result = AmexParser.parse("You made a \$45.00 purchase at WOOLWORTHS")
        requireNotNull(result)
        assertEquals(4500L, result.amountCents)
        assertEquals("WOOLWORTHS", result.merchant)
        assertFalse(result.isCredit)
    }

    @Test
    fun `refund is distinguished from spend`() {
        val result = AmexParser.parse("A credit of \$45.00 was applied at WOOLWORTHS")
        requireNotNull(result)
        assertEquals(4500L, result.amountCents)
        assertTrue(result.isCredit)
    }

    @Test
    fun `amount with a thousands separator`() {
        val result = AmexParser.parse("Your card was charged \$1,999.99 at QANTAS")
        requireNotNull(result)
        assertEquals(199999L, result.amountCents)
        assertEquals("QANTAS", result.merchant)
    }

    @Test
    fun `merchant text containing the word 'at'`() {
        val result = AmexParser.parse("Your card was charged \$10.00 at Eat At Joe's")
        requireNotNull(result)
        assertEquals("Eat At Joe's", result.merchant)
    }

    @Test
    fun `no amount or merchant is dropped, never guessed`() {
        assertNull(AmexParser.parse("Your payment is due on the 15th"))
    }
}
