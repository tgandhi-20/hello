package com.tally.app.ui.spend

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * These target the pure functions in `SpendScreen.kt` directly — no Compose
 * involved, so they run on the host JVM like every other agent's `src/test/`
 * suite (there is no Compose UI testing dependency in this build, per
 * `app/build.gradle.kts`).
 */
class SpendScreenTest {

    @Test
    fun `categorySharePercent is exactly proportional`() {
        assertEquals(50, categorySharePercent(spentCents = 5000L, totalCents = 10000L))
        assertEquals(25, categorySharePercent(spentCents = 2500L, totalCents = 10000L))
        assertEquals(100, categorySharePercent(spentCents = 10000L, totalCents = 10000L))
    }

    @Test
    fun `categorySharePercent rounds to the nearest whole percent`() {
        // 1 of 3 is 33 and 1/3 percent, rounds down to 33
        assertEquals(33, categorySharePercent(spentCents = 100L, totalCents = 300L))
        // 2 of 3 is 66 and 2/3 percent, rounds up to 67
        assertEquals(67, categorySharePercent(spentCents = 200L, totalCents = 300L))
    }

    @Test
    fun `categorySharePercent never divides by a zero or negative total`() {
        assertEquals(0, categorySharePercent(spentCents = 0L, totalCents = 0L))
        assertEquals(0, categorySharePercent(spentCents = 500L, totalCents = 0L))
        assertEquals(0, categorySharePercent(spentCents = 500L, totalCents = -100L))
    }

    @Test
    fun `categorySharePercent is clamped to 100 even if a category somehow exceeds the total`() {
        assertEquals(100, categorySharePercent(spentCents = 15000L, totalCents = 10000L))
    }

    @Test
    fun `categoryShareFraction is exactly proportional`() {
        assertEquals(0.5f, categoryShareFraction(spentCents = 5000L, totalCents = 10000L), 0.0001f)
        assertEquals(0.25f, categoryShareFraction(spentCents = 2500L, totalCents = 10000L), 0.0001f)
    }

    @Test
    fun `categoryShareFraction never divides by a zero or negative total`() {
        assertEquals(0f, categoryShareFraction(spentCents = 0L, totalCents = 0L), 0.0001f)
        assertEquals(0f, categoryShareFraction(spentCents = 500L, totalCents = 0L), 0.0001f)
        assertEquals(0f, categoryShareFraction(spentCents = 500L, totalCents = -100L), 0.0001f)
    }

    @Test
    fun `categoryShareFraction is clamped to 1 even if a category somehow exceeds the total`() {
        assertEquals(1f, categoryShareFraction(spentCents = 15000L, totalCents = 10000L), 0.0001f)
    }
}
