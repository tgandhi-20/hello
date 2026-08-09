package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BankwestParserTest {

    @Test
    fun `maps to the bankwest account`() {
        assertEquals(AccountIds.BANKWEST, BankwestParser.accountId)
    }

    @Test
    fun `normal purchase`() {
        val result = BankwestParser.parse("Purchase of \$12.30 at WOOLWORTHS")
        requireNotNull(result)
        assertEquals(1230L, result.amountCents)
        assertEquals("WOOLWORTHS", result.merchant)
        assertFalse(result.isCredit)
    }

    @Test
    fun `refund is distinguished from spend`() {
        val result = BankwestParser.parse("Refund of \$12.30 from WOOLWORTHS")
        requireNotNull(result)
        assertEquals(1230L, result.amountCents)
        assertEquals("WOOLWORTHS", result.merchant)
        assertTrue(result.isCredit)
    }

    @Test
    fun `amount with a thousands separator`() {
        val result = BankwestParser.parse("Purchase of \$2,500.00 at HARVEY NORMAN")
        requireNotNull(result)
        assertEquals(250000L, result.amountCents)
        assertEquals("HARVEY NORMAN", result.merchant)
    }

    @Test
    fun `merchant text containing the word 'at'`() {
        val result = BankwestParser.parse("Purchase of \$8.00 at The AT Store")
        requireNotNull(result)
        assertEquals("The AT Store", result.merchant)
    }

    @Test
    fun `no merchant is dropped, never guessed`() {
        assertNull(BankwestParser.parse("\$45.00 withdrawn from your account"))
    }

    @Test
    fun `no amount at all is dropped`() {
        assertNull(BankwestParser.parse("Your card is about to expire"))
    }
}
