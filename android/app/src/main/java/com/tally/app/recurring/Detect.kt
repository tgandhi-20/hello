package com.tally.app.recurring

import com.tally.app.money.Category
import com.tally.app.money.Cents
import com.tally.app.money.RecurringCadence
import com.tally.app.money.RecurringSeries
import com.tally.app.money.Txn
import com.tally.app.personal.FORTNIGHTS_PER_MONTH
import com.tally.app.personal.WEEKS_PER_MONTH
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.max

/**
 * Recurring / subscription detection engine. Ported from
 * src/features/recurring/detect.ts.
 *
 * Approach: cluster spend transactions by normalised merchant, then within
 * each merchant sub-cluster by amount (a tolerance band, not exact equality —
 * utilities are never identical), then check whether the dated occurrences
 * fall at a regular cadence within a tolerant window. Pure functions, no
 * store dependency.
 *
 * NOT PORTED: the TypeScript source's `accountId`/`confirmedAt` carry-over
 * fields on `RecurringSeries` (from the statements feature, which isn't in
 * this package's scope) — `com.tally.app.money.RecurringSeries` only models
 * the fields `isBillSeries`/`monthlyEquivalentCents`/this detector actually
 * need. `DEFAULT_OPTIONS` (which hardcodes the real system clock via
 * `todayStr()`) is also deliberately NOT ported — [DetectionOptions.today] has
 * no default here, so every caller (and every test) must pass an explicit
 * date, keeping this fully testable against a fixed calendar day.
 */
data class DetectionOptions(
    /** Minimum occurrences in a cluster before it's confident enough to surface. */
    val minOccurrences: Int = 3,
    /** Relative amount tolerance for clustering, e.g. 0.15 = within 15% of the cluster anchor. */
    val amountTolerancePct: Double = 0.3,
    /** Absolute floor for the amount tolerance band, so tiny amounts don't over-split. */
    val amountToleranceFlatCents: Cents = 500,
    /** Fraction of intervals that must land within a cadence's tolerance window. */
    val minCadenceConfidence: Double = 0.7,
    /** "Today", always injected — see the class doc comment. */
    val today: LocalDate
)

private data class CadenceDef(val cadence: RecurringCadence, val nominalDays: Double, val toleranceDays: Double)

// Weekend/date-shift tolerance grows with the nominal interval.
private val CADENCES = listOf(
    CadenceDef(RecurringCadence.WEEKLY, 7.0, 2.0),
    CadenceDef(RecurringCadence.FORTNIGHTLY, 14.0, 3.0),
    CadenceDef(RecurringCadence.MONTHLY, 30.44, 4.0),
    CadenceDef(RecurringCadence.QUARTERLY, 91.3, 7.0),
    CadenceDef(RecurringCadence.YEARLY, 365.25, 10.0)
)

private fun diffDays(a: LocalDate, b: LocalDate): Long = ChronoUnit.DAYS.between(a, b)

private fun addDaysRounded(d: LocalDate, days: Double): LocalDate = d.plusDays(Math.round(days))

private fun median(nums: List<Double>): Double {
    val sorted = nums.sorted()
    val mid = sorted.size / 2
    return if (sorted.size % 2 == 1) sorted[mid] else (sorted[mid - 1] + sorted[mid]) / 2.0
}

private fun <T> mode(values: List<T>): T {
    val counts = LinkedHashMap<T, Int>()
    for (v in values) counts[v] = (counts[v] ?: 0) + 1
    var best = values[0]
    var bestCount = 0
    for ((v, c) in counts) {
        if (c > bestCount) {
            best = v
            bestCount = c
        }
    }
    return best
}

/**
 * Group a merchant's transactions into amount clusters via a tolerance band, not exact
 * equality. Chain-linked in date order: each txn is compared against the *previous*
 * member of the cluster, not the cluster's centroid — this lets gradual price drift be
 * tracked the way a real bill creeps, and keeps a genuine price hike from silently
 * falling outside the band and disappearing into its own too-small cluster.
 */
fun clusterByAmount(txns: List<Txn>, opts: DetectionOptions): List<List<Txn>> {
    val sorted = txns.sortedBy { it.date }
    val clusters = mutableListOf<List<Txn>>()
    var current = mutableListOf<Txn>()
    var anchor = 0L

    for (t in sorted) {
        if (current.isEmpty()) {
            current = mutableListOf(t)
            anchor = t.amountCents
            continue
        }
        val band = max(anchor * opts.amountTolerancePct, opts.amountToleranceFlatCents.toDouble())
        if (abs((t.amountCents - anchor).toDouble()) <= band) {
            current.add(t)
            anchor = t.amountCents // chain-link: next comparison is against *this* occurrence
        } else {
            clusters.add(current)
            current = mutableListOf(t)
            anchor = t.amountCents
        }
    }
    if (current.isNotEmpty()) clusters.add(current)
    return clusters
}

data class CadenceResult(val cadence: RecurringCadence, val confidence: Double, val medianIntervalDays: Double)

/** Classify a sorted (ascending) list of dates into a cadence, or null if none fits. */
fun classifyCadence(dates: List<LocalDate>, opts: DetectionOptions): CadenceResult? {
    if (dates.size < 2) return null
    val intervals = (1 until dates.size).map { diffDays(dates[it - 1], dates[it]).toDouble() }
    val med = median(intervals)

    var best: CadenceResult? = null
    for (def in CADENCES) {
        val withinTolerance = intervals.count { iv -> abs(iv - def.nominalDays) <= def.toleranceDays }
        val confidence = withinTolerance.toDouble() / intervals.size
        if (confidence >= opts.minCadenceConfidence) {
            if (best == null || abs(def.nominalDays - med) < abs(nominalOf(best.cadence) - med)) {
                best = CadenceResult(def.cadence, confidence, med)
            }
        }
    }
    return best
}

private fun nominalOf(cadence: RecurringCadence): Double = CADENCES.first { it.cadence == cadence }.nominalDays

/** The nominal length in days of a cadence — shared with any feature that needs to
 *  project future occurrence dates using the same per-cadence step length. */
fun cadenceNominalDays(cadence: RecurringCadence): Double = nominalOf(cadence)

/** Advance a (possibly stale) due date forward by whole cadence lengths until it's no
 *  longer in the past. Keeps a confirmed series' `nextDue` moving forward automatically
 *  even without a fresh matching transaction. */
fun rollForwardDueDate(dueDate: LocalDate, cadence: RecurringCadence, today: LocalDate): LocalDate {
    val nominal = nominalOf(cadence)
    var next = dueDate
    var guard = 0
    while (next.isBefore(today) && guard < 60) {
        next = addDaysRounded(next, nominal)
        guard++
    }
    return next
}

private fun nextDueFrom(lastSeen: LocalDate, cadence: RecurringCadence, medianIntervalDays: Double, today: LocalDate): LocalDate {
    val nominal = nominalOf(cadence)
    val projected = (nominal + medianIntervalDays) / 2.0
    var next = addDaysRounded(lastSeen, projected)
    var guard = 0
    while (next.isBefore(today) && guard < 24) {
        next = addDaysRounded(next, nominal)
        guard++
    }
    return next
}

private fun seriesKey(normalizedMerchant: String, cadence: RecurringCadence): String = "$normalizedMerchant::${cadence.id}"

/** Lowercase, strip digits/punctuation/store-reference noise, collapse whitespace.
 *  Ported from src/features/transactions/merchant.ts's `normalizeMerchant` — shared by
 *  the "always categorise X as Y" rule flow and this detector in the original app;
 *  reproduced locally here since `features/transactions/**` is out of this package's
 *  ownership scope. */
fun normalizeMerchant(raw: String): String {
    var s = raw.lowercase()
    s = s.replace(Regex("\\d+"), " ")
    s = s.replace(Regex("[^a-z\\s]"), " ")
    s = s.replace(Regex("\\b(pty|ltd|au|aus|australia|store|shop)\\b"), " ")
    s = s.replace(Regex("\\s+"), " ").trim()
    return s
}

/** Monthly-equivalent cost of a cadence, for the committed portion of the money model.
 *  A negative amount (an income series) contributes nothing rather than crediting it. */
fun monthlyEquivalentCents(amountCents: Cents, cadence: RecurringCadence): Cents {
    val amt = max(0L, amountCents)
    return when (cadence) {
        RecurringCadence.WEEKLY -> Math.round(amt * WEEKS_PER_MONTH)
        RecurringCadence.FORTNIGHTLY -> Math.round(amt * FORTNIGHTS_PER_MONTH)
        RecurringCadence.MONTHLY -> amt
        RecurringCadence.QUARTERLY -> Math.round(amt / 3.0)
        RecurringCadence.YEARLY -> Math.round(amt / 12.0)
    }
}

fun monthlyEquivalentCents(series: RecurringSeries): Cents = monthlyEquivalentCents(series.amountCents, series.cadence)

/**
 * Detect recurring series from transaction history. [existing] lets a previous
 * detection's id/muted/confirmed survive re-detection. CONFIRMED SERIES ARE
 * AUTHORITATIVE: a confirmed prior series keeps its own amount/category/nextDue as-is
 * (only `txnIds`/`lastSeen` refresh), and a confirmed series whose key no longer
 * matches any current cluster is still carried through unchanged (nextDue rolled
 * forward if stale) rather than silently dropped. Unconfirmed series are fully
 * recomputed on every pass.
 */
fun detectRecurring(
    txns: List<Txn>,
    existing: List<RecurringSeries> = emptyList(),
    options: DetectionOptions
): List<RecurringSeries> {
    val opts = options
    val existingByKey = existing.associateBy { seriesKey(normalizeMerchant(it.merchant), it.cadence) }

    val spend = txns.filter { it.amountCents > 0 && !it.excluded }
    val byMerchant = LinkedHashMap<String, MutableList<Txn>>()
    for (t in spend) {
        val source = t.merchant.ifBlank { t.description }
        val key = normalizeMerchant(source)
        if (key.isBlank()) continue
        byMerchant.getOrPut(key) { mutableListOf() }.add(t)
    }

    val out = mutableListOf<RecurringSeries>()

    for ((normalizedMerchant, group) in byMerchant) {
        if (group.size < opts.minOccurrences) continue

        for (cluster in clusterByAmount(group, opts)) {
            if (cluster.size < opts.minOccurrences) continue

            val sorted = cluster.sortedBy { it.date }
            val dates = sorted.map { it.date }
            val cadenceResult = classifyCadence(dates, opts) ?: continue

            val lastTxn = sorted.last()
            val priorTxns = sorted.dropLast(1)
            val baselineAvg: Cents = if (priorTxns.isNotEmpty())
                Math.round(priorTxns.sumOf { it.amountCents }.toDouble() / priorTxns.size)
            else
                lastTxn.amountCents

            val priceIncreaseThreshold = max(Math.round(baselineAvg * 0.05), 100L)
            val priceIncreaseCents: Cents? =
                if (priorTxns.size >= 2 && lastTxn.amountCents - baselineAvg >= priceIncreaseThreshold)
                    lastTxn.amountCents - baselineAvg
                else null

            val key = seriesKey(normalizedMerchant, cadenceResult.cadence)
            val prior = existingByKey[key]
            val confirmed = prior?.confirmed ?: false

            val displayMerchant = mode(sorted.map { t -> t.merchant.ifBlank { t.description } })
            val detectedCategoryId = mode(sorted.map { it.categoryId })

            val series = RecurringSeries(
                id = prior?.id ?: "rec-$key-${sorted[0].id}",
                merchant = displayMerchant,
                categoryId = if (confirmed) prior!!.categoryId else detectedCategoryId,
                cadence = cadenceResult.cadence,
                amountCents = if (confirmed) prior!!.amountCents else lastTxn.amountCents,
                lastSeen = lastTxn.date,
                nextDue = if (confirmed) prior!!.nextDue else nextDueFrom(lastTxn.date, cadenceResult.cadence, cadenceResult.medianIntervalDays, opts.today),
                txnIds = sorted.map { it.id },
                priceIncreaseCents = priceIncreaseCents,
                muted = prior?.muted ?: false,
                confirmed = confirmed
            )
            out.add(series)
        }
    }

    // Confirmed series are authoritative: never silently drop one just because this
    // pass's clustering didn't reproduce its exact merchant+cadence key.
    val emittedIds = out.mapTo(mutableSetOf()) { it.id }
    for (s in existing) {
        if (!s.confirmed || emittedIds.contains(s.id)) continue
        out.add(s.copy(nextDue = if (s.nextDue.isBefore(opts.today)) rollForwardDueDate(s.nextDue, s.cadence, opts.today) else s.nextDue))
        emittedIds.add(s.id)
    }

    return out.sortedBy { it.nextDue }
}

/** Series due within the next [days] days, not muted, soonest first. */
fun dueWithin(series: List<RecurringSeries>, days: Long, today: LocalDate): List<RecurringSeries> {
    val cutoff = today.plusDays(days)
    return series
        .filter { !it.muted && !it.nextDue.isBefore(today) && !it.nextDue.isAfter(cutoff) }
        .sortedBy { it.nextDue }
}

fun totalMonthlyLoadCents(series: List<RecurringSeries>): Cents =
    series.filter { !it.muted }.sumOf { monthlyEquivalentCents(it) }

fun priceIncreases(series: List<RecurringSeries>): List<RecurringSeries> =
    series.filter { !it.muted && (it.priceIncreaseCents ?: 0) > 0 }

fun categoryLookup(categories: List<Category>, id: String): Category? = categories.find { it.id == id }
