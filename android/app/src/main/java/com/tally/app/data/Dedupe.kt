package com.tally.app.data

import java.security.MessageDigest

/**
 * Tally — import dedupe hashing. Kotlin port of src/data/dedupe.ts
 * (CONTRACTS.md §6):
 *
 *   hash = sha256(date | amountCents | normalisedDescription | account | occurrence)
 *
 * `occurrence` distinguishes "the same row, seen again in an overlapping
 * import" from "two different rows that happen to look alike" (e.g. two
 * identical $5.50 coffees on the same day, same card) — see dedupe.ts's doc
 * comment for the full reasoning this preserves.
 *
 * `MessageDigest` is a standard `java.security` API, identical on the host
 * JVM and on-device — no Android framework dependency, no stub risk.
 */
object Dedupe {

    fun normalizeDescription(description: String): String {
        val lower = description.lowercase().trim()
        val stripped = lower.replace(Regex("[^a-z0-9\\s]"), " ")
        return stripped.replace(Regex("\\s+"), " ").trim()
    }

    fun groupKey(date: String, amountCents: Long, description: String, account: String): String {
        val normalised = normalizeDescription(description)
        return "$date|$amountCents|$normalised|$account"
    }

    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) sb.append(String.format("%02x", b))
        return sb.toString()
    }

    fun hashTxn(date: String, amountCents: Long, description: String, account: String, occurrence: Int = 0): String {
        val key = groupKey(date, amountCents, description, account)
        return sha256Hex("$key|$occurrence")
    }

    /**
     * Hash a whole batch of rows at once, assigning each a stable
     * `occurrence` index per distinct (date, amountCents, normalisedDescription,
     * account) group, in the order the rows appear. Mirrors
     * dedupe.ts's `hashTxnsBatch` — reordering the input never changes which
     * hashes come out, only which physical row gets which occurrence index.
     */
    fun hashTxnsBatch(rows: List<Txn>): List<String> {
        val counts = HashMap<String, Int>()
        return rows.map { r ->
            val key = groupKey(r.date, r.amountCents, r.description, r.account)
            val occurrence = counts.getOrDefault(key, 0)
            counts[key] = occurrence + 1
            sha256Hex("$key|$occurrence")
        }
    }
}
