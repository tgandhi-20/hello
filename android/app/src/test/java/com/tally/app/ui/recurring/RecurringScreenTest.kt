package com.tally.app.ui.recurring

import com.tally.app.money.RecurringCadence
import com.tally.app.money.RecurringSeries
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * These target the pure functions in `RecurringScreen.kt` directly — no
 * Compose involved, so they run on the host JVM like every other agent's
 * `src/test/` suite.
 */
class RecurringScreenTest {

    private fun series(
        id: String,
        merchant: String = id,
        cadence: RecurringCadence = RecurringCadence.MONTHLY,
        nextDue: LocalDate = LocalDate.of(2026, 9, 1),
        muted: Boolean = false,
        confirmed: Boolean = false,
        amountCents: Long = 1000L,
    ) = RecurringSeries(
        id = id,
        merchant = merchant,
        categoryId = "cat-other",
        cadence = cadence,
        amountCents = amountCents,
        lastSeen = nextDue.minusMonths(1),
        nextDue = nextDue,
        muted = muted,
        confirmed = confirmed,
    )

    @Test
    fun `cadenceLabel and cadenceGlyph cover every cadence`() {
        assertEquals("Weekly", cadenceLabel(RecurringCadence.WEEKLY))
        assertEquals("Fortnightly", cadenceLabel(RecurringCadence.FORTNIGHTLY))
        assertEquals("Monthly", cadenceLabel(RecurringCadence.MONTHLY))
        assertEquals("Quarterly", cadenceLabel(RecurringCadence.QUARTERLY))
        assertEquals("Yearly", cadenceLabel(RecurringCadence.YEARLY))

        assertEquals("W", cadenceGlyph(RecurringCadence.WEEKLY))
        assertEquals("F", cadenceGlyph(RecurringCadence.FORTNIGHTLY))
        assertEquals("M", cadenceGlyph(RecurringCadence.MONTHLY))
        assertEquals("Q", cadenceGlyph(RecurringCadence.QUARTERLY))
        assertEquals("Y", cadenceGlyph(RecurringCadence.YEARLY))
    }

    @Test
    fun `billStatusLabel mirrors isBillSeries — a monthly series is a bill even unconfirmed`() {
        val monthly = series("rent", cadence = RecurringCadence.MONTHLY, confirmed = false)
        assertEquals("Counted in Bills on Home.", billStatusLabel(monthly))
    }

    @Test
    fun `billStatusLabel mirrors isBillSeries — a weekly habit is not a bill until confirmed`() {
        val weeklyUnconfirmed = series("cafe", cadence = RecurringCadence.WEEKLY, confirmed = false)
        assertEquals("Counted as ordinary spending until confirmed.", billStatusLabel(weeklyUnconfirmed))

        val weeklyConfirmed = series("cafe2", cadence = RecurringCadence.WEEKLY, confirmed = true)
        assertEquals("Counted in Bills on Home.", billStatusLabel(weeklyConfirmed))
    }

    @Test
    fun `sortSeriesForDisplay orders active series soonest-due first`() {
        val later = series("later", nextDue = LocalDate.of(2026, 10, 1))
        val sooner = series("sooner", nextDue = LocalDate.of(2026, 8, 20))
        val result = sortSeriesForDisplay(listOf(later, sooner))
        assertEquals(listOf("sooner", "later"), result.map { it.id })
    }

    @Test
    fun `sortSeriesForDisplay sinks muted series to the bottom without dropping them`() {
        val active = series("active", muted = false, nextDue = LocalDate.of(2026, 12, 1))
        val muted = series("muted", muted = true, nextDue = LocalDate.of(2026, 8, 1))
        val result = sortSeriesForDisplay(listOf(muted, active))
        assertEquals(listOf("active", "muted"), result.map { it.id })
        assertTrue("a muted series must still be present, never hidden entirely", result.any { it.id == "muted" })
    }
}
