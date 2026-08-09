package com.tally.app.util

/**
 * Tally — a minimal, dependency-free JSON parser/writer.
 *
 * WHY THIS EXISTS INSTEAD OF `org.json` OR A LIBRARY
 * ----------------------------------------------------
 * `org.json.*` ships inside `android.jar` as STUB classes for compilation
 * only. Local JVM unit tests (`./gradlew testDebugUnitTest`, the ones CI
 * actually runs) execute on the host JVM, not a device — every `org.json`
 * method call would throw, or (with this project's existing
 * `unitTests.isReturnDefaultValues = true`) silently return null/0/false,
 * either way breaking the exact logic deliverable 6 requires be tested
 * (backup validation has to genuinely parse JSON to fail correctly on a
 * malformed file). Pulling in Robolectric or the standalone `org.json:json`
 * artifact to fix that would add a fifth dependency beyond the four this
 * module is permitted (Room, androidx.security-crypto, androidx.biometric,
 * Kotlin coroutines). So: a small, deliberately boring recursive-descent
 * JSON parser instead, written and verified line-for-line against a set of
 * fixtures (nesting, string escapes including \u, negative/exponent
 * numbers, malformed-input rejection, and integer values beyond 2^53) using
 * a throwaway Java program on this machine's JDK before being ported here —
 * see JsonTest.kt for the same cases as JUnit tests.
 *
 * Integer cents parse straight from the literal's digits to `Long` — never
 * via `Double` — so a value beyond `Number.MAX_SAFE_INTEGER` never loses
 * precision on the way through. See `JsonValue.Num.asLong()`.
 */
sealed class JsonValue {
    object Null : JsonValue()
    data class Bool(val value: Boolean) : JsonValue()

    /** Keeps the original numeric literal text; converts on demand. */
    data class Num(val raw: String) : JsonValue() {
        fun asLong(): Long =
            if (raw.indexOf('.') < 0 && raw.indexOf('e') < 0 && raw.indexOf('E') < 0) {
                raw.toLong()
            } else {
                raw.toDouble().toLong()
            }

        fun asInt(): Int = asLong().toInt()
        fun asDouble(): Double = raw.toDouble()
    }

    data class Str(val value: String) : JsonValue()
    data class Arr(val items: MutableList<JsonValue> = mutableListOf()) : JsonValue()
    data class Obj(val entries: LinkedHashMap<String, JsonValue> = LinkedHashMap()) : JsonValue()
}

class JsonParseException(message: String) : Exception(message)

object Json {

    fun parse(text: String): JsonValue {
        val p = Parser(text)
        p.skipWs()
        val v = p.parseValue()
        p.skipWs()
        if (p.i != text.length) throw JsonParseException("Trailing data at ${p.i}")
        return v
    }

    private class Parser(val s: String) {
        var i = 0

        fun skipWs() {
            while (i < s.length) {
                val c = s[i]
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++ else break
            }
        }

        fun parseValue(): JsonValue {
            if (i >= s.length) throw JsonParseException("Unexpected end of input")
            return when (val c = s[i]) {
                '{' -> parseObject()
                '[' -> parseArray()
                '"' -> JsonValue.Str(parseString())
                't' -> { expect("true"); JsonValue.Bool(true) }
                'f' -> { expect("false"); JsonValue.Bool(false) }
                'n' -> { expect("null"); JsonValue.Null }
                else ->
                    if (c == '-' || c.isDigit()) parseNumber()
                    else throw JsonParseException("Unexpected character '$c' at $i")
            }
        }

        fun expect(lit: String) {
            if (i + lit.length > s.length || !s.regionMatches(i, lit, 0, lit.length)) {
                throw JsonParseException("Expected literal '$lit' at $i")
            }
            i += lit.length
        }

        fun parseObject(): JsonValue.Obj {
            val obj = JsonValue.Obj()
            i++ // consume '{'
            skipWs()
            if (i < s.length && s[i] == '}') { i++; return obj }
            while (true) {
                skipWs()
                if (i >= s.length || s[i] != '"') throw JsonParseException("Expected string key at $i")
                val key = parseString()
                skipWs()
                if (i >= s.length || s[i] != ':') throw JsonParseException("Expected ':' at $i")
                i++
                skipWs()
                val value = parseValue()
                obj.entries[key] = value
                skipWs()
                if (i >= s.length) throw JsonParseException("Unexpected end inside object")
                when (s[i]) {
                    ',' -> { i++ }
                    '}' -> { i++; return obj }
                    else -> throw JsonParseException("Expected ',' or '}' at $i")
                }
            }
        }

        fun parseArray(): JsonValue.Arr {
            val arr = JsonValue.Arr()
            i++ // consume '['
            skipWs()
            if (i < s.length && s[i] == ']') { i++; return arr }
            while (true) {
                skipWs()
                arr.items.add(parseValue())
                skipWs()
                if (i >= s.length) throw JsonParseException("Unexpected end inside array")
                when (s[i]) {
                    ',' -> { i++ }
                    ']' -> { i++; return arr }
                    else -> throw JsonParseException("Expected ',' or ']' at $i")
                }
            }
        }

        fun parseString(): String {
            val sb = StringBuilder()
            i++ // opening quote
            while (true) {
                if (i >= s.length) throw JsonParseException("Unterminated string")
                val c = s[i++]
                if (c == '"') break
                if (c == '\\') {
                    if (i >= s.length) throw JsonParseException("Unterminated escape sequence")
                    when (val e = s[i++]) {
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            if (i + 4 > s.length) throw JsonParseException("Bad unicode escape at $i")
                            val hex = s.substring(i, i + 4)
                            sb.append(hex.toInt(16).toChar())
                            i += 4
                        }
                        else -> throw JsonParseException("Bad escape '\\$e' at ${i - 1}")
                    }
                } else {
                    sb.append(c)
                }
            }
            return sb.toString()
        }

        fun parseNumber(): JsonValue.Num {
            val start = i
            if (i < s.length && s[i] == '-') i++
            if (i >= s.length || !s[i].isDigit()) throw JsonParseException("Invalid number at $start")
            if (s[i] == '0') {
                i++
            } else {
                while (i < s.length && s[i].isDigit()) i++
            }
            if (i < s.length && s[i] == '.') {
                i++
                if (i >= s.length || !s[i].isDigit()) throw JsonParseException("Invalid number fraction at $i")
                while (i < s.length && s[i].isDigit()) i++
            }
            if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                i++
                if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                if (i >= s.length || !s[i].isDigit()) throw JsonParseException("Invalid exponent at $i")
                while (i < s.length && s[i].isDigit()) i++
            }
            return JsonValue.Num(s.substring(start, i))
        }
    }

    fun quoteString(v: String): String {
        val sb = StringBuilder()
        sb.append('"')
        for (c in v) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                else -> if (c.code < 0x20) sb.append("\\u%04x".format(c.code)) else sb.append(c)
            }
        }
        sb.append('"')
        return sb.toString()
    }
}

/** Small fluent builder for a `JsonValue.Obj` — used throughout Models.kt/Backup.kt. */
class JsonObjectBuilder {
    private val obj = JsonValue.Obj()
    fun put(key: String, value: String): JsonObjectBuilder { obj.entries[key] = JsonValue.Str(value); return this }
    fun put(key: String, value: Long): JsonObjectBuilder { obj.entries[key] = JsonValue.Num(value.toString()); return this }
    fun put(key: String, value: Int): JsonObjectBuilder { obj.entries[key] = JsonValue.Num(value.toString()); return this }
    fun put(key: String, value: Boolean): JsonObjectBuilder { obj.entries[key] = JsonValue.Bool(value); return this }
    fun put(key: String, value: JsonValue): JsonObjectBuilder { obj.entries[key] = value; return this }
    fun putArray(key: String, values: List<String>): JsonObjectBuilder {
        val arr = JsonValue.Arr(values.map { JsonValue.Str(it) as JsonValue }.toMutableList())
        obj.entries[key] = arr
        return this
    }
    fun build(): JsonValue.Obj = obj
}

fun jsonObject(block: JsonObjectBuilder.() -> Unit): JsonValue.Obj = JsonObjectBuilder().apply(block).build()

fun JsonValue.stringify(): String = when (this) {
    is JsonValue.Null -> "null"
    is JsonValue.Bool -> value.toString()
    is JsonValue.Num -> raw
    is JsonValue.Str -> Json.quoteString(value)
    is JsonValue.Arr -> items.joinToString(",", "[", "]") { it.stringify() }
    is JsonValue.Obj -> entries.entries.joinToString(",", "{", "}") { (k, v) -> "${Json.quoteString(k)}:${v.stringify()}" }
}

// ---------------------------------------------------------------------------
// Convenience accessors for JsonValue.Obj — org.json-style get*/opt* naming
// so call sites elsewhere read familiarly. `get*` throws JsonParseException
// (never a raw NPE/ClassCastException) on a missing or wrong-typed field —
// load-bearing for Backup.kt, which must fail cleanly on a malformed file.
// ---------------------------------------------------------------------------

fun JsonValue.Obj.has(key: String): Boolean = entries.containsKey(key) && entries[key] !is JsonValue.Null

fun JsonValue.Obj.getString(key: String): String =
    (entries[key] as? JsonValue.Str)?.value ?: throw JsonParseException("Missing/invalid string field '$key'")

fun JsonValue.Obj.optString(key: String, default: String = ""): String =
    (entries[key] as? JsonValue.Str)?.value ?: default

fun JsonValue.Obj.optStringOrNull(key: String): String? = (entries[key] as? JsonValue.Str)?.value

fun JsonValue.Obj.getLong(key: String): Long =
    (entries[key] as? JsonValue.Num)?.asLong() ?: throw JsonParseException("Missing/invalid number field '$key'")

fun JsonValue.Obj.optLong(key: String, default: Long = 0L): Long =
    (entries[key] as? JsonValue.Num)?.asLong() ?: default

fun JsonValue.Obj.optLongOrNull(key: String): Long? = (entries[key] as? JsonValue.Num)?.asLong()

fun JsonValue.Obj.getInt(key: String): Int =
    (entries[key] as? JsonValue.Num)?.asInt() ?: throw JsonParseException("Missing/invalid number field '$key'")

fun JsonValue.Obj.optInt(key: String, default: Int = 0): Int =
    (entries[key] as? JsonValue.Num)?.asInt() ?: default

fun JsonValue.Obj.getBoolean(key: String): Boolean =
    (entries[key] as? JsonValue.Bool)?.value ?: throw JsonParseException("Missing/invalid boolean field '$key'")

fun JsonValue.Obj.optBoolean(key: String, default: Boolean = false): Boolean =
    (entries[key] as? JsonValue.Bool)?.value ?: default

fun JsonValue.Obj.optBooleanOrNull(key: String): Boolean? = (entries[key] as? JsonValue.Bool)?.value

fun JsonValue.Obj.getArray(key: String): List<JsonValue> =
    (entries[key] as? JsonValue.Arr)?.items ?: throw JsonParseException("Missing/invalid array field '$key'")

fun JsonValue.Obj.optArray(key: String): List<JsonValue>? = (entries[key] as? JsonValue.Arr)?.items

fun JsonValue.Obj.getObject(key: String): JsonValue.Obj =
    entries[key] as? JsonValue.Obj ?: throw JsonParseException("Missing/invalid object field '$key'")

fun JsonValue.Obj.optObject(key: String): JsonValue.Obj? = entries[key] as? JsonValue.Obj
