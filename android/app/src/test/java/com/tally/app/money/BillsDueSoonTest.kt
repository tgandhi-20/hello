package com.tally.app.money

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * JUnit port of the "Bills due soon" half of
 * src/features/today/__checks__/run.ts. Same fixtures (`TODAY`, `SETTINGS`,
 * `series()`), same expected outcomes, same section comments so the two can
 * be diffed by eye.
 *
 * Four of the TS suite's checks assert a value is "finite" (`Number.isFinite`)
 * or "is an array" (`Array.isArray`). Both are TYPE-SYSTEM TAUTOLOGIES in
 * Kotlin — `amountCents` is `Cents? = Long?`, which cannot hold NaN/Infinity,
 * and `buildBillsDueSoon` has a static `List<BillDueSoonItem>` return type, so
 * it cannot return a non-list. Transcribing those checks literally would be
 * asserting something the compiler already guarantees. Each is instead
 * adapted below into the nearest MEANINGFUL assertion the original test was
 * actually guarding against (a window-bounds check, or "does not throw") —
 * see the comment on each.
 */
class BillsDueSoonTest {

    private val TODAY: LocalDate = LocalDate.of(2026, 8, 9)

    private val SETTINGS = Settings(
        currency = "AUD",
        locale = "en-AU",
        paydayDayOfMonth = 15,
        monthlyIncomeCents = 645_700,
        savingsTargetCents = 350_000
    )

    private fun series(
        id: String = "r1",
        merchant: String = "Test Bill",
        nextDue: LocalDate = LocalDate.of(2026, 8, 12),
        cadence: RecurringCadence = RecurringCadence.MONTHLY,
        amountCents: Cents = 21_000
    ): RecurringSeries = RecurringSeries(
        id = id,
        merchant = merchant,
        categoryId = "cat-utilities",
        cadence = cadence,
        amountCents = amountCents,
        lastSeen = LocalDate.of(2026, 7, 12),
        nextDue = nextDue,
        txnIds = emptyList()
    )

    // -----------------------------------------------------------------------
    // Bills due soon — window, ordering, boundaries
    // -----------------------------------------------------------------------

    @Test
    fun `bill inside the window is included`() {
        val items = buildBillsDueSoon(emptyList(), listOf(series()), SETTINGS, TODAY)
        assertTrue(items.any { it.label.contains("Test Bill") })
    }

    @Test
    fun `bill on the horizon edge is included, bill past the horizon is excluded`() {
        // Exactly on the horizon edge: today + 14 days must still be included, and
        // one day past it must not. Off-by-one here silently hides a rent payment.
        val onEdge = series(id = "edge", merchant = "Edge Bill", nextDue = LocalDate.of(2026, 8, 23))
        val past = series(id = "past", merchant = "Past Bill", nextDue = LocalDate.of(2026, 8, 24))
        val items = buildBillsDueSoon(emptyList(), listOf(onEdge, past), SETTINGS, TODAY)
        assertTrue("bill on the horizon edge is included", items.any { it.label.contains("Edge Bill") })
        assertTrue("bill past the horizon is excluded", items.none { it.label.contains("Past Bill") })
    }

    @Test
    fun `bill before today is excluded`() {
        // A bill that was due yesterday is history, not something "due soon".
        val items = buildBillsDueSoon(
            emptyList(),
            listOf(series(merchant = "Yesterday Bill", nextDue = LocalDate.of(2026, 8, 8))),
            SETTINGS,
            TODAY
        )
        assertTrue(items.none { it.label.contains("Yesterday Bill") })
    }

    @Test
    fun `bills are sorted by date, soonest first`() {
        val items = buildBillsDueSoon(
            emptyList(),
            listOf(
                series(id = "late", merchant = "Later", nextDue = LocalDate.of(2026, 8, 20)),
                series(id = "soon", merchant = "Sooner", nextDue = LocalDate.of(2026, 8, 11))
            ),
            SETTINGS,
            TODAY
        )
        val dates = items.map { it.date }
        assertEquals(dates.sorted(), dates)
    }

    @Test
    fun `every item has a date within the window (adapted from the TS finite-amount check)`() {
        // TS fixture: recurring=[], but SETTINGS has monthlyIncomeCents/
        // savingsTargetCents > 0, so the salary and savings-transfer events
        // still populate the list — this is not the empty list it might look
        // like at a glance. The "finite amountCents or null" half of the
        // original check is a Kotlin type-system tautology (see class doc
        // comment); what's left, and genuinely worth checking, is that every
        // emitted date actually falls inside the requested window.
        val items = buildBillsDueSoon(emptyList(), emptyList(), SETTINGS, TODAY)
        assertTrue("salary/savings-transfer events are produced from settings alone", items.isNotEmpty())
        val horizonEnd = TODAY.plusDays(BILLS_DUE_SOON_HORIZON_DAYS.toLong())
        assertTrue(items.all { !it.date.isBefore(TODAY) && !it.date.isAfter(horizonEnd) })
    }

    @Test
    fun `horizon is 14 days`() {
        assertEquals(14, BILLS_DUE_SOON_HORIZON_DAYS)
    }

    // -----------------------------------------------------------------------
    // Degenerate inputs must stay well-formed
    // -----------------------------------------------------------------------

    @Test
    fun `zero income produces no bill events at all`() {
        // Adapted from "zero income produces no non-finite bill amounts" — the
        // finiteness half is a Kotlin tautology (Cents? is Long?, never NaN).
        // What's meaningfully left to check: the income/savings-transfer guard
        // (`> 0`) actually suppresses those events rather than emitting a
        // zero-amount or garbage one, and empty recurring + empty txns
        // produces an empty, not a crashing, result.
        val zeroIncome = SETTINGS.copy(monthlyIncomeCents = 0, savingsTargetCents = 0)
        val items = buildBillsDueSoon(emptyList(), emptyList(), zeroIncome, TODAY)
        assertTrue(items.isEmpty())
    }

    @Test
    fun `a zero-day horizon never throws`() {
        // Adapted from "Array.isArray(items)" — `buildBillsDueSoon` has a
        // static List return type in Kotlin, so that half is a tautology; a
        // JUnit test that reaches its assertion without an exception already
        // proves the meaningful half of the original check (the zero-length
        // window doesn't blow up the roll-forward/collection loops).
        val items = buildBillsDueSoon(emptyList(), listOf(series()), SETTINGS, TODAY, horizonDays = 0)
        assertTrue(items.none { it.label.contains("Test Bill") }) // due the 12th, horizon ends today
    }
}
