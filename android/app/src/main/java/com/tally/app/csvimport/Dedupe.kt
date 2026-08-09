package com.tally.app.csvimport

import com.tally.app.money.AccountId
import com.tally.app.money.Cents
import com.tally.app.money.Txn
import java.security.MessageDigest
import java.time.LocalDate

/**
 * Import dedupe hashing. Ported from src/data/dedupe.ts (the single source of
 * truth in the original app) plus src/import/dedupe.ts's `existingHashSet`.
 *
 * hash = sha256(date | amountCents | normalisedDescription | account | occurrence)
 *
 * ## Why `occurrence` exists
 *
 * The contract's hash formula alone — sha256(date|amountCents|description|account) —
 * collapses two genuinely distinct transactions that happen to share all four
 * fields: two identical $5.50 coffees at the same café on the same day, paid
 * on the same card. That is not a hypothetical; it is completely ordinary.
 * Hashing those two rows to the same value makes the second one
 * indistinguishable from "the first one, seen again in a re-imported
 * statement" — so it silently gets dropped as a duplicate. Real money would
 * vanish with no hint to the user.
 *
 * The fix distinguishes "the same row, encountered again in an overlapping
 * import" from "two different rows that happen to look alike": every row
 * also carries an `occurrence` index — 0 for the first row seen with a given
 * (date, amount, description, account) key *within the batch being hashed*,
 * 1 for the next one seen with that same key, and so on. Two identical rows
 * in one file get occurrence 0 and 1 and hash differently, so both survive.
 * Re-importing the same file re-derives occurrence 0 and 1 for the same two
 * rows (in whichever order they appear — occurrence assignment only depends
 * on how many identical rows exist, not row order), reproducing the same two
 * hashes, so both are correctly recognised as duplicates.
 *
 * `occurrence` defaults to 0 for single-row callers (manual entry, editing
 * one transaction) — there is no "batch" to enumerate against.
 *
 * KOTLIN NOTE: the original TS uses `crypto.subtle.digest` (WebCrypto),
 * inherently async (returns a `Promise`). `java.security.MessageDigest` is
 * synchronous, so every function here is a plain (non-suspend) function —
 * there is no async boundary to cross on the JVM for a single SHA-256 call,
 * and no coroutines dependency is needed for this layer.
 */

/** Lowercase, trim, collapse whitespace, strip punctuation noise — stable across re-exports of the same statement. */
fun normalizeDescription(description: String): String {
    return description
        .lowercase()
        .trim()
        .replace(Regex("[^a-z0-9\\s]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
}

/** The fields the dedupe hash is derived from, before `occurrence` is applied. */
data class DedupeFields(val date: LocalDate, val amountCents: Cents, val description: String, val account: AccountId)

/** The (date, amountCents, normalisedDescription, account) grouping key, with no occurrence baked in. */
fun dedupeGroupKey(fields: DedupeFields): String {
    val normalised = normalizeDescription(fields.description)
    return "${fields.date}|${fields.amountCents}|$normalised|${fields.account.id}"
}

private fun sha256Hex(input: String): String {
    val digestBytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
    val sb = StringBuilder(digestBytes.size * 2)
    for (b in digestBytes) sb.append(String.format("%02x", b))
    return sb.toString()
}

fun hashTxn(date: LocalDate, amountCents: Cents, description: String, account: AccountId, occurrence: Int = 0): String {
    val groupKey = dedupeGroupKey(DedupeFields(date, amountCents, description, account))
    return sha256Hex("$groupKey|$occurrence")
}

/**
 * Hash a whole batch of rows at once, assigning each a stable `occurrence`
 * index — 0, 1, 2, … — per distinct (date, amountCents, normalisedDescription,
 * account) group, in the order the rows appear in [rows]. Returned hashes are
 * in the same order as [rows].
 *
 * Order-independence: because rows sharing a group key are, by definition,
 * indistinguishable from each other, it does not matter *which* physical row
 * within a group receives occurrence 0 vs. 1 vs. 2 — the *set* of hashes a
 * group produces is identical regardless of the rows' order within the file.
 */
fun hashTxnsBatch(rows: List<DedupeFields>): List<String> {
    val counts = HashMap<String, Int>()
    val hashes = MutableList(rows.size) { "" }
    for (i in rows.indices) {
        val r = rows[i]
        val groupKey = dedupeGroupKey(r)
        val occurrence = counts.getOrDefault(groupKey, 0)
        counts[groupKey] = occurrence + 1
        hashes[i] = hashTxn(r.date, r.amountCents, r.description, r.account, occurrence)
    }
    return hashes
}

/** Build the set of existing dedupe hashes from the store's current transactions. */
fun existingHashSet(txns: List<Txn>): Set<String> = txns.map { it.hash }.toSet()
