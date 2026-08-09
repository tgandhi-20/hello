package com.tally.app.capture.dedupe

import com.tally.app.capture.model.AccountIds
import com.tally.app.capture.model.PendingCapture
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.util.UUID

class CaptureDedupeHashTest {

    @Test
    fun `matches src data dedupe ts's normalizeDescription exactly`() {
        assertEquals("campos coffee", CaptureDedupeHash.normalizeDescription("  CAMPOS  COFFEE!! "))
        assertEquals("jb hi fi", CaptureDedupeHash.normalizeDescription("JB HI-FI"))
    }

    @Test
    fun `hash is deterministic for identical inputs`() {
        val a = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.CBA)
        val b = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.CBA)
        assertEquals(a, b)
    }

    @Test
    fun `is a lowercase 64-char hex sha256 digest`() {
        val hash = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.CBA)
        assertEquals(64, hash.length)
        assertEquals(hash, hash.lowercase())
        assertEquals(true, hash.all { it.isDigit() || it in 'a'..'f' })
    }

    @Test
    fun `different occurrence indices hash differently`() {
        val first = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.CBA, occurrence = 0)
        val second = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.CBA, occurrence = 1)
        assertNotEquals(first, second)
    }

    @Test
    fun `different accounts never collide`() {
        val cba = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.CBA)
        val amex = CaptureDedupeHash.compute("2026-08-09", 550L, "Campos Coffee", AccountIds.AMEX)
        assertNotEquals(cba, amex)
    }

    @Test
    fun `assignOccurrence counts only matching, account-resolved items in the buffer`() {
        val postedAt = 1_754_722_800_000L // 2025-08-09 in UTC-ish, exact date doesn't matter -- consistency does
        val existing = listOf(
            capture(account = AccountIds.CBA, amountCents = 550L, merchant = "Campos Coffee", postedAt = postedAt),
            capture(account = AccountIds.CBA, amountCents = 550L, merchant = "Campos Coffee", postedAt = postedAt),
            // A different merchant -- must not count toward the group.
            capture(account = AccountIds.CBA, amountCents = 550L, merchant = "Woolworths", postedAt = postedAt),
            // Account still unresolved (wallet tap) -- must not count toward any group.
            capture(account = null, amountCents = 550L, merchant = "Campos Coffee", postedAt = postedAt),
        )
        val date = com.tally.app.capture.util.CaptureDate.localDateString(postedAt)
        val occurrence = CaptureDedupeHash.assignOccurrence(existing, date, 550L, "Campos Coffee", AccountIds.CBA)
        assertEquals(2, occurrence)
    }

    private fun capture(account: String?, amountCents: Long, merchant: String, postedAt: Long) = PendingCapture(
        id = UUID.randomUUID().toString(),
        packageName = "com.commbank.netbank",
        account = account,
        amountCents = amountCents,
        merchant = merchant,
        rawText = "irrelevant for this test",
        postedAt = postedAt,
        dedupeHash = null,
    )
}
