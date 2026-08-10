package com.tally.app.ui.capture

import com.tally.app.capture.model.PendingCapture
import com.tally.app.categorize.Rule
import com.tally.app.categorize.categorizeDescription
import com.tally.app.csvimport.DedupeFields
import com.tally.app.csvimport.dedupeGroupKey
import com.tally.app.csvimport.hashTxn
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * Pure PendingCapture -> Txn mapping, plus the hash-based correlation
 * `VaultCaptureBridge` needs to work out which of `VaultRepository.addTxns`'s
 * returned rows corresponds to which accepted capture. No Android import
 * anywhere in this file -- same reasoning as
 * `com.tally.app.capture.ingest.CaptureIngestPipeline`'s own doc comment --
 * so it is fully covered by local JUnit tests (see CaptureLedgerMappingTest)
 * independent of `VaultCaptureBridge` (which touches `VaultRepository`, a
 * real `Context`/Room/Keystore-backed class a local unit test cannot
 * meaningfully construct -- see that class's own doc comment).
 */

/**
 * One [PendingCapture] -> one candidate [Txn], or `null` when the capture has
 * no resolvable account. That should never happen once
 * [com.tally.app.capture.review.CaptureReviewQueue]'s `accept`/`acceptAll`
 * have done their job (a `null` account there is surfaced as
 * `CaptureOutcome.NeedsAccount` and never reaches a writer), but this stays
 * defensive rather than throwing -- a stray call simply produces nothing to
 * write, which the caller treats as "not written", instead of crashing.
 *
 * FIELD MAPPING, exactly:
 *  - `id`          <- a fresh UUID. `VaultRepository.addTxns` reassigns its
 *                     own id to every row it actually inserts anyway (mirrors
 *                     CSV import), so nothing depends on this one.
 *  - `date`        <- `postedAt` (epoch millis) converted to the device's
 *                     current local calendar date -- the same conversion
 *                     `com.tally.app.capture.util.CaptureDate.localDateString`
 *                     performs, just kept as a `LocalDate` instead of being
 *                     formatted back to a string.
 *  - `amountCents` <- copied verbatim. Already integer cents; positive =
 *                     spend, negative = refund/credit, same convention
 *                     `Txn.amountCents` documents.
 *  - `description` <- `capture.merchant`, VERBATIM -- deliberately NOT
 *                     `capture.rawText`. This is the one that needs care:
 *                     `CaptureReviewQueue.accept`/`acceptAll` already computed
 *                     a pre-check dedupe hash from `capture.merchant`
 *                     (`CaptureDedupeHash.compute`, byte-for-bit the same
 *                     formula as `hashTxn` below) and checked it against the
 *                     ledger via `LedgerHashLookup.containsHash` BEFORE this
 *                     Txn is ever built. If `description` here were anything
 *                     else, `VaultRepository.addTxns` would hash a different
 *                     string for the same capture and the two dedupe checks
 *                     would silently disagree with each other.
 *  - `merchant`    <- `categorizeDescription(capture.merchant, ...).merchant`,
 *                     the cleaned/canonical display name -- exactly the role
 *                     `Txn.merchant` plays for a CSV row (see
 *                     `csvimport/Parse.kt`'s `buildImportPreview`).
 *  - `categoryId`  <- the same `categorizeDescription` call's category.
 *  - `account`     <- `AccountId.fromId(capture.account)`.
 *  - `source`      <- `TxnSource.MANUAL` -- this was accepted from a
 *                     notification, not a CSV row.
 *  - `hash`        <- a placeholder. `VaultRepository.addTxns` recomputes and
 *                     overwrites the hash (and the id, `createdAt`,
 *                     `updatedAt`) for every row it actually inserts, so
 *                     nothing here depends on this value being anything in
 *                     particular.
 */
internal fun pendingCaptureToTxnCandidate(
    capture: PendingCapture,
    categories: List<Category>,
    rules: List<Rule>,
    now: Long = System.currentTimeMillis(),
): Txn? {
    val account = capture.account?.let(AccountId::fromId) ?: return null
    val date = Instant.ofEpochMilli(capture.postedAt).atZone(ZoneId.systemDefault()).toLocalDate()
    val categorized = categorizeDescription(capture.merchant, rules, categories)
    return Txn(
        id = UUID.randomUUID().toString(),
        date = date,
        amountCents = capture.amountCents,
        description = capture.merchant,
        merchant = categorized.merchant,
        categoryId = categorized.categoryId,
        account = account,
        source = TxnSource.MANUAL,
        hash = "",
        createdAt = now,
        updatedAt = now,
    )
}

/**
 * Predicts, for a whole batch and in list order, the exact hash
 * `VaultRepository.addTxns` will assign each candidate -- same fields, same
 * occurrence-per-group-key counting, same formula (`dedupeGroupKey`/
 * `hashTxn`, the very functions `addTxns` itself calls internally) -- keyed
 * by that hash. This is what lets the rows `addTxns` actually inserts (which
 * come back with freshly-assigned ids, never the placeholder ones assigned
 * above) be matched back to the [PendingCapture] each one came from, without
 * relying on list order surviving `addTxns`'s own duplicate-skipping filter.
 */
internal fun predictBatchHashes(pairs: List<Pair<PendingCapture, Txn>>): Map<String, PendingCapture> {
    val occurrenceCounts = HashMap<String, Int>()
    val byHash = LinkedHashMap<String, PendingCapture>()
    for ((capture, txn) in pairs) {
        val groupKey = dedupeGroupKey(DedupeFields(txn.date, txn.amountCents, txn.description, txn.account))
        val occurrence = occurrenceCounts.getOrDefault(groupKey, 0)
        occurrenceCounts[groupKey] = occurrence + 1
        val hash = hashTxn(txn.date, txn.amountCents, txn.description, txn.account, occurrence)
        byHash[hash] = capture
    }
    return byHash
}

/**
 * Matches `VaultRepository.addTxns`'s actually-inserted rows back to the
 * [PendingCapture] each one came from, via [predictBatchHashes]. Anything
 * `addTxns` dropped as a duplicate is simply absent from [inserted], so it is
 * also absent from the result here -- exactly the "not written, stays
 * pending" contract
 * [com.tally.app.capture.review.AcceptedCaptureWriter.writeBatch] documents.
 */
internal fun matchWrittenCaptures(pairs: List<Pair<PendingCapture, Txn>>, inserted: List<Txn>): List<PendingCapture> {
    val byHash = predictBatchHashes(pairs)
    return inserted.mapNotNull { byHash[it.hash] }
}
