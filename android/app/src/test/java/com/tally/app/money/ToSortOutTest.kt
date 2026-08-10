package com.tally.app.money

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * JUnit port of the "To sort out" half of
 * src/features/today/__checks__/run.ts, plus extra coverage for the parts of
 * `buildToSortOut` this Android port implements that the original TS suite
 * didn't happen to exercise (price rises, and the vaultHasData/routine gate
 * — see `ToSortOut.kt`'s doc comment for what's ported and why).
 *
 * One TS check ("zero income produces a finite to-sort-out list",
 * `Array.isArray(sort)`) is a Kotlin type-system tautology — `buildToSortOut`
 * has a static `List<ToSortOutItem>` return type, so it cannot return
 * anything else. It's kept below as a smoke test (a JUnit test that reaches
 * its assertion without throwing already proves the meaningful half of the
 * original check) rather than a literal, always-true re-assertion.
 */
class ToSortOutTest {

    private val TODAY: LocalDate = LocalDate.of(2026, 8, 9)

    private var txnCounter = 0

    private fun mkTxn(
        source: TxnSource,
        categoryId: String,
        excluded: Boolean = false,
        date: LocalDate = TODAY
    ): Txn {
        txnCounter++
        return Txn(
            id = "t$txnCounter",
            date = date,
            amountCents = 1_250,
            description = "fixture",
            merchant = "fixture",
            categoryId = categoryId,
            account = AccountId.CBA,
            source = source,
            hash = "h$txnCounter",
            excluded = excluded,
            createdAt = 0,
            updatedAt = 0
        )
    }

    private fun mkSeries(
        id: String = "r1",
        merchant: String = "Test Bill",
        priceIncreaseCents: Cents? = null,
        muted: Boolean = false
    ): RecurringSeries = RecurringSeries(
        id = id,
        merchant = merchant,
        categoryId = "cat-utilities",
        cadence = RecurringCadence.MONTHLY,
        amountCents = 21_000,
        lastSeen = LocalDate.of(2026, 7, 12),
        nextDue = LocalDate.of(2026, 8, 12),
        txnIds = emptyList(),
        priceIncreaseCents = priceIncreaseCents,
        muted = muted
    )

    // -----------------------------------------------------------------------
    // Empty-state suppression — the rule that keeps Home from becoming a wall
    // -----------------------------------------------------------------------

    @Test
    fun `nothing to sort out on a clean vault`() {
        val items = buildToSortOut(emptyList(), emptyList(), emptyList(), TODAY)
        assertEquals(0, items.size)
    }

    @Test
    fun `an uncategorised import surfaces, and every item has somewhere to go`() {
        // One uncategorised imported transaction is genuinely something to sort out.
        val txn = mkTxn(source = TxnSource.CSV, categoryId = "cat-other")
        val items = buildToSortOut(listOf(txn), emptyList(), emptyList(), TODAY)
        assertTrue(items.any { it.kind == ToSortOutKind.UNCATEGORISED })
        assertTrue(items.all { it.to.isNotEmpty() })
    }

    @Test
    fun `a manual entry on the fallback category does not nag`() {
        // A manually logged transaction left on the fallback category is a
        // deliberate choice, not an import to clean up — it must not nag.
        val manual = mkTxn(source = TxnSource.MANUAL, categoryId = "cat-other")
        val items = buildToSortOut(listOf(manual), emptyList(), emptyList(), TODAY)
        assertFalse(items.any { it.kind == ToSortOutKind.UNCATEGORISED })
    }

    @Test
    fun `an excluded transfer does not ask to be categorised`() {
        val excluded = mkTxn(source = TxnSource.CSV, categoryId = "cat-other", excluded = true)
        val items = buildToSortOut(listOf(excluded), emptyList(), emptyList(), TODAY)
        assertFalse(items.any { it.kind == ToSortOutKind.UNCATEGORISED })
    }

    @Test
    fun `buildToSortOut never throws on degenerate input (smoke test)`() {
        // Adapted from "zero income produces a finite to-sort-out list" — see
        // class doc comment for why the literal check is a tautology here.
        val items = buildToSortOut(emptyList(), emptyList(), emptyList(), TODAY)
        assertTrue(items.isEmpty())
    }

    // -----------------------------------------------------------------------
    // Price rises — not exercised by the original TS fixtures, but reachable
    // logic in this file; reuses `recurring.priceIncreases` unchanged.
    // -----------------------------------------------------------------------

    @Test
    fun `a detected price rise surfaces with its amount`() {
        val series = mkSeries(priceIncreaseCents = 500)
        val items = buildToSortOut(emptyList(), listOf(series), emptyList(), TODAY)
        val item = items.single { it.kind == ToSortOutKind.PRICE_RISE }
        assertEquals(500L, item.amountCents)
        assertTrue(item.title.contains("Test Bill"))
    }

    @Test
    fun `a muted series' price rise does not surface`() {
        val series = mkSeries(priceIncreaseCents = 500, muted = true)
        val items = buildToSortOut(emptyList(), listOf(series), emptyList(), TODAY)
        assertFalse(items.any { it.kind == ToSortOutKind.PRICE_RISE })
    }

    // -----------------------------------------------------------------------
    // The vaultHasData gate — the bug this port was explicitly briefed to
    // guard: a brand-new, completely empty vault must never show a routine
    // item as due/overdue just because a calendar date has passed. The web
    // app shipped this bug once ("Export & review statements — Overdue" on
    // an empty vault); the fix is `vaultHasData = txns.isNotEmpty() ||
    // recurring.isNotEmpty()`, reproduced in `ToSortOut.kt` unchanged.
    // -----------------------------------------------------------------------

    private fun overdueRoutineItem(id: String = "first-saturday") = ResolvedRoutineItem(
        id = id,
        label = "Export & review statements",
        done = false,
        dueDate = TODAY.minusDays(1),
        overdue = true
    )

    @Test
    fun `an overdue routine item is suppressed entirely on a completely empty vault`() {
        val items = buildToSortOut(
            txns = emptyList(),
            recurring = emptyList(),
            resolvedRoutineItems = listOf(overdueRoutineItem()),
            today = TODAY
        )
        assertTrue("a new install with zero txns and zero recurring must never show a routine item as due/overdue", items.isEmpty())
    }

    @Test
    fun `the same overdue routine item DOES surface once the vault has any data`() {
        val txn = mkTxn(source = TxnSource.MANUAL, categoryId = "cat-groceries")
        val items = buildToSortOut(
            txns = listOf(txn),
            recurring = emptyList(),
            resolvedRoutineItems = listOf(overdueRoutineItem()),
            today = TODAY
        )
        val item = items.single { it.kind == ToSortOutKind.ROUTINE }
        assertEquals("Export & review statements", item.title)
        assertEquals("Overdue", item.subtitle)
    }

    @Test
    fun `a done routine item is excluded even with vault data`() {
        val txn = mkTxn(source = TxnSource.MANUAL, categoryId = "cat-groceries")
        val done = overdueRoutineItem().copy(done = true)
        val items = buildToSortOut(listOf(txn), emptyList(), listOf(done), TODAY)
        assertFalse(items.any { it.kind == ToSortOutKind.ROUTINE })
    }

    @Test
    fun `a routine item due in the future is excluded even with vault data`() {
        val txn = mkTxn(source = TxnSource.MANUAL, categoryId = "cat-groceries")
        val future = overdueRoutineItem().copy(dueDate = TODAY.plusDays(1), overdue = false)
        val items = buildToSortOut(listOf(txn), emptyList(), listOf(future), TODAY)
        assertFalse(items.any { it.kind == ToSortOutKind.ROUTINE })
    }

    @Test
    fun `a routine item due exactly today surfaces as Due today, not Overdue`() {
        val txn = mkTxn(source = TxnSource.MANUAL, categoryId = "cat-groceries")
        val dueToday = overdueRoutineItem().copy(dueDate = TODAY, overdue = false)
        val items = buildToSortOut(listOf(txn), emptyList(), listOf(dueToday), TODAY)
        val item = items.single { it.kind == ToSortOutKind.ROUTINE }
        assertEquals("Due today", item.subtitle)
    }
}
