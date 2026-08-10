package com.tally.app.ui.goal

import com.tally.app.money.MonthMoneySavingsProgress
import com.tally.app.ui.model.formatMoney
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * These target the pure functions in `GoalScreen.kt` directly — no Compose
 * involved, so they run on the host JVM like every other agent's `src/test/`
 * suite.
 */
class GoalScreenTest {

    private fun progress(
        actualCents: Long,
        targetCents: Long = 7_233_900L,
        onTrack: Boolean = true,
        behindCents: Long = 0L,
        isUserEntered: Boolean = true,
        daysUntilTarget: Int = 100,
        monthlyTargetCents: Long = 350_000L,
        projectedCents: Long = actualCents,
    ) = MonthMoneySavingsProgress(
        monthlyTargetCents = monthlyTargetCents,
        goalTargetCents = targetCents,
        goalTargetDate = LocalDate.of(2027, 10, 30),
        projectedBalanceCents = projectedCents,
        actualBalanceCents = actualCents,
        isBalanceUserEntered = isUserEntered,
        behindCents = behindCents,
        onTrack = onTrack,
        daysUntilTarget = daysUntilTarget,
    )

    @Test
    fun `goalProgressFraction is exactly proportional under target`() {
        val p = progress(actualCents = 1_000_000L, targetCents = 4_000_000L)
        assertEquals(0.25f, goalProgressFraction(p), 0.0001f)
    }

    @Test
    fun `goalProgressFraction clamps to 1 once the balance exceeds target`() {
        val p = progress(actualCents = 9_000_000L, targetCents = 4_000_000L)
        assertEquals(1f, goalProgressFraction(p), 0.0001f)
    }

    @Test
    fun `goalProgressFraction never divides by a non-positive target`() {
        val p = progress(actualCents = 100L, targetCents = 0L)
        assertEquals(0f, goalProgressFraction(p), 0.0001f)
    }

    @Test
    fun `goalStatusText states the target when on track, never a scold`() {
        val p = progress(actualCents = 4_000_000L, targetCents = 7_233_900L, onTrack = true)
        val text = goalStatusText(p)
        assertTrue(text.contains("On track"))
        assertTrue(text.contains(formatMoney(7_233_900L)))
    }

    @Test
    fun `goalStatusText states the gap in dollars when behind, as a fact`() {
        val p = progress(actualCents = 1_000_000L, onTrack = false, behindCents = 50000L)
        val text = goalStatusText(p)
        assertTrue(text.contains(formatMoney(50000L)))
        assertTrue(text.contains("behind"))
    }

    @Test
    fun `daysUntilTargetLabel handles zero, one, many and a passed date`() {
        assertEquals("target date has passed", daysUntilTargetLabel(-3))
        assertEquals("target date is today", daysUntilTargetLabel(0))
        assertEquals("1 day left", daysUntilTargetLabel(1))
        assertEquals("42 days left", daysUntilTargetLabel(42))
    }

    @Test
    fun `formatGoalDate reads as a plain date, not an ISO string`() {
        assertEquals("30 October 2027", formatGoalDate(LocalDate.of(2027, 10, 30)))
    }
}
