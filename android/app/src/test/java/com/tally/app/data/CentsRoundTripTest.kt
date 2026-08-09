package com.tally.app.data

import com.tally.app.security.VaultCrypto
import com.tally.app.util.Json
import com.tally.app.util.JsonValue
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Deliverable 6: "integer-cents round-tripping with no precision loss."
 *
 * Money is `Long` cents everywhere (never Double/Float/BigDecimal) — this
 * test exercises the full path a stored transaction actually goes through:
 * `Txn` -> JSON text (`toJson().stringify()`) -> AES-GCM ciphertext
 * (`VaultCrypto.encryptJSON`) -> decrypted JSON text -> parsed back
 * (`txnFromJson`), and checks `amountCents` survives exactly. It also
 * covers values a naive `Double`-based implementation would corrupt:
 * amounts beyond `Number.MAX_SAFE_INTEGER` (2^53), and negative cents
 * (income/refund rows — `src/types.ts`: "Positive = spend, negative =
 * income").
 */
class CentsRoundTripTest {

    private val key = VaultCrypto.deriveKey("135790", VaultCrypto.generateSalt())

    private fun sampleTxn(amountCents: Long): Txn = Txn(
        id = "t1",
        date = "2026-08-09",
        amountCents = amountCents,
        description = "test",
        merchant = "Test Merchant",
        categoryId = "cat-1",
        account = "cba",
        source = "manual",
        hash = "h1",
        createdAt = 1L,
        updatedAt = 1L,
    )

    private fun roundTripThroughEncryption(t: Txn): Txn {
        val blob = VaultCrypto.encryptJSON(key, t.toJson().stringify())
        val decrypted = VaultCrypto.decryptJSON(key, blob)
        return txnFromJson(Json.parse(decrypted) as JsonValue.Obj)
    }

    @Test
    fun `an ordinary amount round-trips exactly`() {
        val original = sampleTxn(550L) // $5.50
        val restored = roundTripThroughEncryption(original)
        assertEquals(550L, restored.amountCents)
    }

    @Test
    fun `zero round-trips exactly`() {
        val restored = roundTripThroughEncryption(sampleTxn(0L))
        assertEquals(0L, restored.amountCents)
    }

    @Test
    fun `negative amounts (income, refunds) round-trip exactly`() {
        val restored = roundTripThroughEncryption(sampleTxn(-245000L)) // -$2,450.00 income
        assertEquals(-245000L, restored.amountCents)
    }

    @Test
    fun `an amount beyond Number-MAX_SAFE_INTEGER survives with no precision loss`() {
        // 2^53 = 9007199254740992 is the largest integer a Double (and
        // therefore JS's `number`) can represent exactly. One cent above
        // that is where a Double-based implementation would silently round.
        val huge = 9_007_199_254_740_993L
        val restored = roundTripThroughEncryption(sampleTxn(huge))
        assertEquals(huge, restored.amountCents)
    }

    @Test
    fun `Long-MAX_VALUE-adjacent cents value round-trips exactly`() {
        val large = Long.MAX_VALUE - 1
        val restored = roundTripThroughEncryption(sampleTxn(large))
        assertEquals(large, restored.amountCents)
    }

    @Test
    fun `a batch of varied cents values all round-trip exactly`() {
        val values = listOf(1L, 99L, 100L, 550L, 123456789L, -1L, -999999L, 0L)
        for (v in values) {
            assertEquals(v, roundTripThroughEncryption(sampleTxn(v)).amountCents)
        }
    }

    @Test
    fun `JSON layer alone (no crypto) preserves large cents values`() {
        // Isolates the claim to the JSON parser specifically (see
        // JsonTest's equivalent case) rather than the crypto round trip.
        val obj = Json.parse("{\"amountCents\":9007199254740993}") as JsonValue.Obj
        assertEquals(9007199254740993L, obj.getLong("amountCents"))
    }
}
