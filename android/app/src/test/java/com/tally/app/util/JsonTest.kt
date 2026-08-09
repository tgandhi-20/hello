package com.tally.app.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the hand-rolled JSON parser/writer in util/Json.kt — see that
 * file's doc comment for why it exists instead of `org.json` (the Android
 * SDK's stub-only-in-unit-tests version of it). Backup.kt and Models.kt
 * both depend on this being correct, so it is tested directly, not just
 * indirectly through BackupValidationTest.
 */
class JsonTest {

    @Test
    fun `parses nested objects, arrays, and primitive types`() {
        val sample = "{\"id\":\"abc-123\",\"amountCents\":2450,\"note\":null,\"flag\":true," +
            "\"tags\":[\"a\",\"b\\n\"],\"nested\":{\"x\":1.5e2,\"y\":-3}}"
        val obj = Json.parse(sample) as JsonValue.Obj

        assertEquals("abc-123", obj.getString("id"))
        assertEquals(2450L, obj.getLong("amountCents"))
        assertTrue(obj.entries["note"] is JsonValue.Null)
        assertEquals(true, obj.getBoolean("flag"))

        val tags = obj.getArray("tags")
        assertEquals("a", (tags[0] as JsonValue.Str).value)
        assertEquals("b\n", (tags[1] as JsonValue.Str).value)

        val nested = obj.getObject("nested")
        assertEquals(150.0, (nested.entries["x"] as JsonValue.Num).asDouble(), 0.0001)
        assertEquals(-3L, nested.getLong("y"))
    }

    @Test
    fun `string escapes round-trip including quotes, backslash, and control characters`() {
        val tricky = "he said \"hi\"\\yo\u0001end"
        val encoded = Json.quoteString(tricky)
        val decoded = (Json.parse(encoded) as JsonValue.Str).value
        assertEquals(tricky, decoded)
    }

    @Test
    fun `unicode escape sequences decode correctly`() {
        val obj = Json.parse("{\"s\":\"caf\\u00e9\"}") as JsonValue.Obj
        assertEquals("café", obj.getString("s"))
    }

    @Test
    fun `malformed input is rejected, never silently accepted`() {
        val badInputs = listOf("{", "{\"a\":}", "[1,2,]", "not json", "{\"a\":1,}", "")
        for (bad in badInputs) {
            var threw = false
            try {
                Json.parse(bad)
            } catch (e: JsonParseException) {
                threw = true
            }
            assertTrue("expected '$bad' to throw JsonParseException", threw)
        }
    }

    @Test
    fun `large integers beyond Double precision round-trip exactly`() {
        // Number.MAX_SAFE_INTEGER is 9007199254740991 — this is one more than that.
        val obj = Json.parse("{\"amountCents\":9007199254740993}") as JsonValue.Obj
        assertEquals(9007199254740993L, obj.getLong("amountCents"))
    }

    @Test
    fun `negative integer cents round-trip exactly (income rows)`() {
        val obj = Json.parse("{\"amountCents\":-250000}") as JsonValue.Obj
        assertEquals(-250000L, obj.getLong("amountCents"))
    }

    @Test
    fun `builder and stringify produce parseable JSON`() {
        val built = jsonObject {
            put("id", "t1")
            put("amountCents", 2450L)
            put("builtin", false)
            putArray("tags", listOf("x", "y"))
        }
        val roundTripped = Json.parse(built.stringify()) as JsonValue.Obj
        assertEquals("t1", roundTripped.getString("id"))
        assertEquals(2450L, roundTripped.getLong("amountCents"))
        assertFalse(roundTripped.getBoolean("builtin"))
        assertEquals(listOf("x", "y"), roundTripped.getArray("tags").map { (it as JsonValue.Str).value })
    }

    @Test
    fun `optional accessors return null or defaults instead of throwing when a field is absent`() {
        val obj = Json.parse("{\"a\":1}") as JsonValue.Obj
        assertEquals(null, obj.optStringOrNull("missing"))
        assertEquals(0L, obj.optLong("missing"))
        assertFalse(obj.has("missing"))
        assertTrue(obj.has("a"))
    }
}
