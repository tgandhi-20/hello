package com.tally.app.ui.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `formatMoney`/`formatTxnAmount` are display-only formatting (never a
 * computation) over `en-AU` currency via the host JVM's own ICU data, so
 * assertions here check the properties that must hold regardless of exactly
 * which ICU data build the CI JDK ships (digit grouping, decimal point,
 * sign) rather than a single brittle exact string — the same reasoning
 * `src/ui/format.ts`'s own web-side checks use.
 */
class MoneyTest {

    @Test
    fun rendersDollarsAndCents() {
        val out = formatMoney(123_456L)
        assertTrue("expected a currency figure, got '$out'", out.contains("1,234.56") || out.contains("1234.56"))
    }

    @Test
    fun negativeCentsGetALeadingMinus() {
        val out = formatMoney(-500L)
        assertTrue("expected a minus sign, got '$out'", out.contains("-"))
    }

    @Test
    fun negativeZeroNeverRendersAsNegative() {
        val out = formatMoney(0L)
        assertFalse("zero must never render with a minus sign, got '$out'", out.contains("-"))
    }

    @Test
    fun showSignAddsAPlusOnlyToPositiveAmounts() {
        assertTrue(formatMoney(500L, showSign = true).startsWith("+"))
        assertFalse(formatMoney(0L, showSign = true).startsWith("+"))
    }

    @Test
    fun hideCentsOmitsTrailingZerosOnWholeDollarAmounts() {
        val whole = formatMoney(500_00L, hideCents = true)
        assertFalse("whole-dollar amount should hide .00, got '$whole'", whole.contains("."))
        val fractional = formatMoney(500_50L, hideCents = true)
        assertTrue("a genuinely fractional amount must still show cents", fractional.contains("50"))
    }

    @Test
    fun formatTxnAmountShowsIncomeWithAPlusAndSpendPlain() {
        val spend = formatTxnAmount(2_500L)
        assertFalse(spend.startsWith("+"))
        assertFalse(spend.contains("-"))

        val income = formatTxnAmount(-2_500L)
        assertTrue(income.startsWith("+"))
        assertFalse(income.contains("-"))
    }
}
