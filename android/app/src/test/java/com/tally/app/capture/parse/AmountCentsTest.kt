package com.tally.app.capture.parse

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AmountCentsTest {

    @Test
    fun `plain whole dollars`() {
        assertEquals(4500L, AmountCents.parseNumeral("45"))
    }

    @Test
    fun `two decimal places`() {
        assertEquals(550L, AmountCents.parseNumeral("5.50"))
    }

    @Test
    fun `one decimal place is tenths of a dollar`() {
        assertEquals(550L, AmountCents.parseNumeral("5.5"))
    }

    @Test
    fun `thousands separator is stripped, never mistaken for a decimal point`() {
        assertEquals(123456L, AmountCents.parseNumeral("1,234.56"))
    }

    @Test
    fun `multiple thousands separators`() {
        assertEquals(123456700L, AmountCents.parseNumeral("1,234,567.00"))
    }

    @Test
    fun `zero dollars and some cents`() {
        assertEquals(99L, AmountCents.parseNumeral("0.99"))
    }

    @Test
    fun `exact cents never a rounded float`() {
        // 19.999999999... as a Double would be the classic float trap this
        // type exists to avoid entirely -- parseNumeral never touches Double.
        assertEquals(1999L, AmountCents.parseNumeral("19.99"))
    }

    @Test
    fun `blank is not a number`() {
        assertNull(AmountCents.parseNumeral(""))
        assertNull(AmountCents.parseNumeral("   "))
    }

    @Test
    fun `more than two decimal places is rejected, not truncated`() {
        assertNull(AmountCents.parseNumeral("5.505"))
    }

    @Test
    fun `two decimal points is rejected`() {
        assertNull(AmountCents.parseNumeral("5.5.0"))
    }

    @Test
    fun `non-numeric text is rejected`() {
        assertNull(AmountCents.parseNumeral("free"))
        assertNull(AmountCents.parseNumeral("5.5x"))
    }
}
