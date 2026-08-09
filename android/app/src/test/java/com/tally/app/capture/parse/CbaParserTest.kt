package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CbaParserTest {

    @Test
    fun `maps to the cba account`() {
        assertEquals(AccountIds.CBA, CbaParser.accountId)
    }

    @Test
    fun `normal purchase`() {
        val result = CbaParser.parse("You spent \$5.50 at CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
        assertFalse(result.isCredit)
    }

    @Test
    fun `refund is distinguished from spend`() {
        val result = CbaParser.parse("You were refunded \$5.50 by CAMPOS COFFEE")
        requireNotNull(result)
        assertEquals(550L, result.amountCents)
        assertEquals("CAMPOS COFFEE", result.merchant)
        assertTrue(result.isCredit)
    }

    @Test
    fun `alternate refund phrasing`() {
        val result = CbaParser.parse("\$12.00 refunded from WOOLWORTHS")
        requireNotNull(result)
        assertEquals(1200L, result.amountCents)
        assertEquals("WOOLWORTHS", result.merchant)
        assertTrue(result.isCredit)
    }

    @Test
    fun `amount with a thousands separator`() {
        val result = CbaParser.parse("You spent \$1,234.56 at JB HI-FI")
        requireNotNull(result)
        assertEquals(123456L, result.amountCents)
        assertEquals("JB HI-FI", result.merchant)
    }

    @Test
    fun `merchant text containing the word 'at'`() {
        val result = CbaParser.parse("You spent \$12.00 at Eat At Joe's Cafe")
        requireNotNull(result)
        assertEquals(1200L, result.amountCents)
        assertEquals("Eat At Joe's Cafe", result.merchant)
    }

    @Test
    fun `no amount or merchant is dropped, never guessed`() {
        assertNull(CbaParser.parse("\$45.00 debited from your account"))
    }

    @Test
    fun `unrelated notification text is dropped`() {
        assertNull(CbaParser.parse("Your statement is ready to view"))
    }
}
