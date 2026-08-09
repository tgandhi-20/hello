package com.tally.app.personal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * JUnit port of src/personal/__checks__/run.ts, sections 1-8 (the plan's own
 * constants and their pure derived math). Section 9 (`applyPersonalPlan`) is
 * NOT ported — it writes budgets/recurring series into the store, which is
 * data/store-layer orchestration outside this package's scope (see
 * `Plan.kt`'s top-of-file doc comment).
 */
class PlanTest {

    private fun approx(actualCents: Long, expectedCents: Long, toleranceCents: Long): Boolean =
        Math.abs(actualCents - expectedCents) <= toleranceCents

    // =======================================================================
    // 1. The conversion rule (§1): weekly -> monthly is x52/12, never x4.
    // =======================================================================
    @Test
    fun `1 - weekly to monthly is 52 over 12, never x4`() {
        assertEquals("WEEKS_PER_MONTH is 52/12, not 4.348 or 4", 52.0 / 12.0, WEEKS_PER_MONTH, 0.0)
        assertEquals(
            "weeklyToMonthlyCents(\$600/wk rent) === \$2,600/month (user's own §3 figure)",
            260_000L, weeklyToMonthlyCents(60_000)
        )
        assertTrue("weeklyToMonthlyCents is NOT the x4 error", weeklyToMonthlyCents(60_000) != 60_000L * 4)
    }

    // =======================================================================
    // 2. Living costs identity (§3): must sum to exactly $2,957.
    // =======================================================================
    @Test
    fun `2 - living costs sum to exactly 2957`() {
        assertEquals("Living costs sum to exactly \$2,957", 295_700L, LIVING_COSTS_CENTS)
    }

    // =======================================================================
    // 3. Net housing (§3): rent - sublet-offset + utilities = $1,293.
    // =======================================================================
    @Test
    fun `3 - net housing is exactly 1293`() {
        assertEquals("NET_HOUSING_CENTS is exactly \$1,293", 129_300L, NET_HOUSING_CENTS)
        assertEquals(
            "computeNetHousingCents(rent, sublet, utilities) === \$1,293",
            129_300L, computeNetHousingCents(260_000, -151_700, 21_000)
        )
    }

    // =======================================================================
    // 4. Take-home identity (§0): $6,457 - $2,957 = $3,500 exactly.
    // =======================================================================
    @Test
    fun `4 - take-home minus living costs equals savings target`() {
        assertEquals("INCOME.netMonthlyCents is \$6,457", 645_700L, INCOME.netMonthlyCents)
        assertEquals(
            "Take-home (\$6,457) - living costs (\$2,957) = savings target (\$3,500), exactly",
            PLAN_DEFAULTS.savingsTargetCents, INCOME.netMonthlyCents - LIVING_COSTS_CENTS
        )
        assertEquals("PLAN_DEFAULTS.savingsTargetCents is \$3,500", 350_000L, PLAN_DEFAULTS.savingsTargetCents)
        assertEquals("PLAN_DEFAULTS.paydayDayOfMonth is the 15th", 15, PLAN_DEFAULTS.paydayDayOfMonth)
    }

    // =======================================================================
    // 5. Food group (§4): caps sum to $610/month, convert to ~$141/week (±$1)
    //    using 52/12.
    // =======================================================================
    @Test
    fun `5 - food group caps and weekly conversion`() {
        assertEquals("Food group is exactly 4 categories", 4, FOOD_GROUP_CATEGORY_IDS.size)
        assertEquals("Food group monthly caps sum to \$610", 61_000L, FOOD_GROUP_MONTHLY_CAP_CENTS)
        assertTrue(
            "Food group \$610/month converts to ~\$141/week (±\$1, via 52/12)",
            approx(monthlyToWeeklyCents(FOOD_GROUP_MONTHLY_CAP_CENTS), FOOD_GROUP_WEEKLY_TARGET_CENTS, 100)
        )
        // Cross-check against the x4 error, which must NOT be within a dollar of the true figure.
        assertTrue(
            "The x4 error would NOT pass the ±\$1 food-group check (proves the test is meaningful)",
            Math.abs(61_000L * 4 - FOOD_GROUP_WEEKLY_TARGET_CENTS) > 100
        )
    }

    // =======================================================================
    // 6. Subscriptions (§5): the four known ones sum to ~$36 (±$1). Flagged
    //    (not silently equal): they actually sum to $36.17, 17c over the §3
    //    cap of exactly $36.00 — both figures asserted distinctly.
    // =======================================================================
    @Test
    fun `6 - subscriptions total vs the cap, both kept distinct`() {
        assertEquals("Four known subscriptions", 4, KNOWN_SUBSCRIPTIONS.size)
        assertTrue("The four subscriptions sum to ~\$36 (±\$1)", approx(KNOWN_SUBSCRIPTIONS_TOTAL_CENTS, 3_600, 100))
        assertEquals("Known subscriptions total is exactly \$36.17 (§5)", 3_617L, KNOWN_SUBSCRIPTIONS_TOTAL_CENTS)
        assertEquals("cat-subscriptions cap is exactly \$36.00 (§3)", 3_600L, categoryCapCents("cat-subscriptions"))
        assertTrue(
            "FLAGGED: §3 cap (\$36.00) and §5 real total (\$36.17) do NOT reconcile to the cent — both kept, not fudged",
            KNOWN_SUBSCRIPTIONS_TOTAL_CENTS != 3_600L && KNOWN_SUBSCRIPTIONS_TOTAL_CENTS - 3_600L == 17L
        )
    }

    // =======================================================================
    // 7. Cash, one-offs, goal (§6).
    // =======================================================================
    @Test
    fun `7 - cash, one-offs and goal`() {
        assertEquals("Starting cash is \$40,000", 4_000_000L, STARTING_CASH_CENTS)

        val netChange = -AUGUST_2026_EVENTS.sumOf { it.amountCents }
        assertEquals(
            "End-of-August cash reconciles exactly from the six August events",
            EXPECTED_END_OF_AUGUST_CASH_CENTS, STARTING_CASH_CENTS + netChange
        )
        assertEquals("End-of-August cash is ~\$33,569", 3_356_900L, EXPECTED_END_OF_AUGUST_CASH_CENTS)

        assertTrue(
            "FLAGGED: moving-costs breakdown (\$4,400) does not match the August event line (-\$4,000) — \$400 apart, not fudged",
            MOVING_COSTS_DISCREPANCY_CENTS == 40_000L && MOVING_COSTS_BREAKDOWN_TOTAL_CENTS == 440_000L
        )
        assertEquals("Two planned one-offs modelled", 2, PLANNED_ONE_OFFS.size)
        assertEquals("Oct 2026 one-off is \$9,500", 950_000L, PLANNED_ONE_OFFS[0].amountCents)
        assertEquals("Feb 2027 one-off is \$3,500", 350_000L, PLANNED_ONE_OFFS[1].amountCents)
        assertEquals("Interest schedule has 2 periods (5.2% then 5.0%)", 2, SAVINGS_INTEREST_SCHEDULE.size)
        assertEquals("First interest period is 5.2%", 5.2, SAVINGS_INTEREST_SCHEDULE[0].annualRatePct, 0.0)
        assertEquals("First interest period ends 2026-11-01", LocalDate.of(2026, 11, 1), SAVINGS_INTEREST_SCHEDULE[0].until)
        assertEquals("Second interest period is 5.0%", 5.0, SAVINGS_INTEREST_SCHEDULE[1].annualRatePct, 0.0)
        assertEquals("Goal is \$72,339", 7_233_900L, GOAL.targetCents)
        assertEquals("Goal date is 2027-10-30", LocalDate.of(2027, 10, 30), GOAL.targetDate)
    }

    // =======================================================================
    // 8. Category frozen ids (§3) — spot-check the ones other packages depend on.
    // =======================================================================
    @Test
    fun `8 - frozen category ids and caps`() {
        val idSet = PERSONAL_CATEGORIES.map { it.id }.toSet()
        for (id in listOf(
            "cat-groceries", "cat-eating-out", "cat-lunch", "cat-coffee", "cat-rent", "cat-sublet",
            "cat-utilities", "cat-subscriptions", "cat-savings", "cat-income", "cat-oneoff", "cat-other"
        )) {
            assertTrue("Frozen category id present: $id", idSet.contains(id))
        }
        assertEquals("cat-rent cap is \$2,600", 260_000L, categoryCapCents("cat-rent"))
        assertEquals("cat-sublet cap is -\$1,517 (income offset)", -151_700L, categoryCapCents("cat-sublet"))
        assertEquals("cat-utilities cap is \$210", 21_000L, categoryCapCents("cat-utilities"))
        assertEquals("cat-savings cap is \$3,500", 350_000L, categoryCapCents("cat-savings"))
        assertEquals("cat-income has no cap", null, categoryCapCents("cat-income"))
        assertEquals("cat-oneoff has no cap", null, categoryCapCents("cat-oneoff"))
    }
}
