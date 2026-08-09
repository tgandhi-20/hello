package com.tally.app.capture.ingest

import com.tally.app.capture.model.AccountIds
import com.tally.app.capture.parse.CbaParser
import com.tally.app.capture.parse.GoogleWalletParser
import com.tally.app.capture.testutil.FakeCaptureBuffer
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureIngestPipelineTest {

    @Test
    fun `a clean purchase is captured with the parsed amount, merchant and account`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val result = CaptureIngestPipeline.ingest(
            buffer = buffer,
            packageName = "com.commbank.netbank",
            parser = CbaParser,
            notificationKey = "key-1",
            postedAtMillis = 1_754_722_800_000L,
            title = "CommBank",
            text = "You spent \$5.50 at CAMPOS COFFEE"
        )

        assertTrue(result is IngestResult.Captured)
        val item = (result as IngestResult.Captured).item
        assertEquals(550L, item.amountCents)
        assertEquals("CAMPOS COFFEE", item.merchant)
        assertEquals(AccountIds.CBA, item.account)
        assertEquals(1, buffer.pendingItems().size)
        assertEquals(0, buffer.droppedCount())
    }

    @Test
    fun `a refund is stored as negative cents`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val result = CaptureIngestPipeline.ingest(
            buffer = buffer,
            packageName = "com.commbank.netbank",
            parser = CbaParser,
            notificationKey = "key-1",
            postedAtMillis = 1_754_722_800_000L,
            title = "CommBank",
            text = "You were refunded \$5.50 by CAMPOS COFFEE"
        )
        val item = (result as IngestResult.Captured).item
        assertEquals(-550L, item.amountCents)
    }

    @Test
    fun `a notification that does not parse is dropped and counted, never guessed`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val result = CaptureIngestPipeline.ingest(
            buffer = buffer,
            packageName = "com.commbank.netbank",
            parser = CbaParser,
            notificationKey = "key-1",
            postedAtMillis = 1_754_722_800_000L,
            title = "CommBank",
            text = "\$45.00 debited from your account"
        )
        assertTrue(result is IngestResult.Dropped)
        assertEquals(0, buffer.pendingItems().size)
        assertEquals(1, buffer.droppedCount())
    }

    @Test
    fun `blank notification text is dropped and counted`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val result = CaptureIngestPipeline.ingest(
            buffer = buffer,
            packageName = "com.commbank.netbank",
            parser = CbaParser,
            notificationKey = "key-1",
            postedAtMillis = 1_754_722_800_000L,
            title = "CommBank",
            text = "   "
        )
        assertTrue(result is IngestResult.Dropped)
        assertEquals(1, buffer.droppedCount())
    }

    @Test
    fun `a reposted notification -- identical package, key, post time, title and text -- is not double-captured`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val packageName = "com.commbank.netbank"
        val notificationKey = "key-1"
        val postedAtMillis = 1_754_722_800_000L
        val title = "CommBank"
        val text = "You spent \$5.50 at CAMPOS COFFEE"

        val first = CaptureIngestPipeline.ingest(buffer, packageName, CbaParser, notificationKey, postedAtMillis, title, text)
        val second = CaptureIngestPipeline.ingest(buffer, packageName, CbaParser, notificationKey, postedAtMillis, title, text)

        assertTrue(first is IngestResult.Captured)
        assertTrue(second is IngestResult.DuplicateIgnored)
        assertEquals(1, buffer.pendingItems().size) // not 2
        assertEquals(0, buffer.droppedCount()) // a repost is not a parse failure either
    }

    @Test
    fun `two genuinely distinct same-day identical-looking purchases both survive`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        CaptureIngestPipeline.ingest(
            buffer, "com.commbank.netbank", CbaParser, "key-1", 1_754_722_800_000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE"
        )
        CaptureIngestPipeline.ingest(
            buffer, "com.commbank.netbank", CbaParser, "key-2", 1_754_722_800_000L, "CommBank", "You spent \$5.50 at CAMPOS COFFEE"
        )

        val items = buffer.pendingItems()
        assertEquals(2, items.size)
        assertTrue(items[0].dedupeHash != items[1].dedupeHash) // distinct occurrence indices
    }

    @Test
    fun `a wallet tap confirmation is captured with no account and no dedupe hash yet`() = runBlocking {
        val buffer = FakeCaptureBuffer()
        val result = CaptureIngestPipeline.ingest(
            buffer = buffer,
            packageName = "com.google.android.apps.walletnfcrel",
            parser = GoogleWalletParser,
            notificationKey = "key-1",
            postedAtMillis = 1_754_722_800_000L,
            title = "Google Wallet",
            text = "You paid \$5.50 to CAMPOS COFFEE"
        )
        val item = (result as IngestResult.Captured).item
        assertNull(item.account)
        assertNull(item.dedupeHash)
    }
}
