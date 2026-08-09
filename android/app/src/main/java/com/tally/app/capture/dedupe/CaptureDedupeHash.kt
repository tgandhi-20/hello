package com.tally.app.capture.dedupe

import com.tally.app.capture.model.PendingCapture
import com.tally.app.capture.util.CaptureDate

/**
 * Kotlin port of `src/data/dedupe.ts`'s hash formula:
 *
 * ```
 * hash = sha256(date|amountCents|normalisedDescription|account|occurrence)
 * ```
 *
 * bit-for-bit, so a value computed here and a value computed by the web/store
 * side from equal inputs are the identical hex string. `normalizeDescription`
 * below is a direct line-for-line port of the TS function of the same name.
 *
 * ## An important, honest limitation
 *
 * "Same hash scheme" gets this module only so far. The formula's
 * `normalisedDescription` component is deliberately *conservative* on the CSV
 * side (see `src/data/dedupe.ts`'s doc comment) -- it lowercases and strips
 * punctuation but does **not** strip bank noise like "EFTPOS PURCHASE",
 * reference numbers or trailing suburb/state codes (that heavier cleanup is
 * `cleanMerchant` in `src/categorize/normalize.ts`, used for display and
 * categorisation, never for dedupe). A CBA statement row's raw description
 * might read `"EFTPOS PURCHASE CAMPOS COFFEE SYDNEY NSW"`; the merchant text
 * this module extracts from a notification for the very same purchase is
 * `"CAMPOS COFFEE"`. Those normalise to different strings, so the two hashes
 * will **not** collide, and the CSV-imported row and the captured-then-accepted
 * row will both land as separate transactions.
 *
 * There is no fix for this available at the capture layer: the raw CSV
 * description does not exist yet at capture time, and inventing one would be
 * exactly the kind of guess this whole feature is built to avoid. What this
 * hash formula *does* correctly guarantee, because [PendingCapture.merchant]
 * is what both sides of the comparison actually use:
 *   - the same notification, reposted, produces the same hash and is not
 *     double-captured (on top of the separate notification-signature check in
 *     `CaptureSignature`, which is what actually prevents the duplicate before
 *     it is ever parsed a second time);
 *   - two accepted captures never collide with each other;
 *   - once the real ledger implements `LedgerHashLookup` against its own
 *     stored hashes, a capture that was *already imported with description
 *     text identical to the captured merchant* (a manual entry someone typed
 *     the same way, for instance) is correctly recognised as a duplicate.
 * Catching the CSV-vs-capture case for real would need fuzzy merchant
 * matching, which is a `data/**`-layer decision, not this module's to make
 * unilaterally -- flagged for the orchestrator in the delivery report.
 */
object CaptureDedupeHash {

    /** Direct port of `src/data/dedupe.ts`'s `normalizeDescription`. */
    fun normalizeDescription(description: String): String =
        description
            .lowercase()
            .trim()
            .replace(Regex("[^a-z0-9\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    /** Direct port of `dedupeGroupKey` -- the hash inputs before `occurrence` is folded in. */
    fun groupKey(date: String, amountCents: Long, description: String, account: String): String =
        "$date|$amountCents|${normalizeDescription(description)}|$account"

    /** Direct port of `hashTxn`. */
    fun compute(date: String, amountCents: Long, description: String, account: String, occurrence: Int = 0): String =
        Sha256.hex("${groupKey(date, amountCents, description, account)}|$occurrence")

    /**
     * The Kotlin analogue of `hashTxnsBatch`'s occurrence assignment, scoped to
     * whatever is currently sitting in the pending buffer (this layer has no
     * visibility into the real ledger's existing hashes -- see the class doc).
     * Returns how many *already-buffered* items share this item's group key,
     * i.e. the occurrence index the new item should be assigned.
     */
    fun assignOccurrence(existing: List<PendingCapture>, date: String, amountCents: Long, description: String, account: String): Int {
        val targetKey = groupKey(date, amountCents, description, account)
        return existing.count { item ->
            val itemDate = CaptureDate.localDateString(item.postedAt)
            item.account != null && groupKey(itemDate, item.amountCents, item.merchant, item.account) == targetKey
        }
    }
}
