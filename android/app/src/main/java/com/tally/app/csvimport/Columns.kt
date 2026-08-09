package com.tally.app.csvimport

import kotlin.math.abs

/**
 * Structural column-role detection. Ported from src/import/columns.ts. We
 * never trust header names — public bank CSV documentation is inconsistent
 * and formats drift. Instead every column is sampled and scored by the
 * *shape* of its content: does it parse as a date, as a signed amount, is it
 * mostly free text, is it a large monotonic-ish running balance.
 */

enum class ColumnRole { DATE, AMOUNT, DEBIT, CREDIT, BALANCE, DESCRIPTION, UNKNOWN }

data class ColumnProfile(val index: Int, val role: ColumnRole, val score: Double)

data class StructuralLayout(
    val hasHeader: Boolean,
    val headerRow: List<String>?,
    /** Data rows only — header row (if any) excluded. */
    val dataRows: List<List<String>>,
    val columns: List<ColumnProfile>,
    val dateCol: Int?,
    val descriptionCol: Int?,
    /** Set when a single signed amount column carries the transaction value. */
    val amountCol: Int?,
    /** Set instead of [amountCol] when spend/income are split across two columns. */
    val debitCol: Int?,
    val creditCol: Int?,
    val balanceCol: Int?,
    /** Overall confidence that this structural read is trustworthy (0-1). */
    val confidence: Double,
    val warnings: List<String>
)

private const val SAMPLE_SIZE = 60

private fun fraction(count: Int, total: Int): Double = if (total == 0) 0.0 else count.toDouble() / total

/** Score how "row 0 is a header, not data" a raw matrix looks. */
private fun rowLooksLikeData(row: List<String>): Double {
    val nonEmpty = row.filter { it != "" }
    if (nonEmpty.isEmpty()) return 0.0
    val matches = nonEmpty.count { looksLikeDate(it) || looksLikeMoney(it) }
    return fraction(matches, nonEmpty.size)
}

/** Detect whether the first row of the matrix is a header row. */
private fun detectHeader(rows: List<List<String>>): Boolean {
    if (rows.size < 2) return false
    val first = rowLooksLikeData(rows[0])
    val rest = rows.subList(1, minOf(rows.size, 6)).map { rowLooksLikeData(it) }
    val restAvg = if (rest.isNotEmpty()) rest.sum() / rest.size else 0.0
    // Header rows very rarely look like dates/amounts; data rows do more than headers do.
    // Compare RELATIVELY, not against a fixed absolute threshold.
    if (restAvg <= 0) return false
    return first <= restAvg * 0.5
}

private data class ColumnStats(
    val index: Int,
    val total: Int,
    val emptyCount: Int,
    val dateCount: Int,
    val moneyCount: Int,
    val textCount: Int,
    /** Signed cents for cells that parsed as money, in row order (null for non-money cells). */
    val moneyValues: List<Long?>,
    val meanAbsMoney: Double
)

private fun profileColumns(dataRows: List<List<String>>, colCount: Int): List<ColumnStats> {
    val sample = dataRows.take(SAMPLE_SIZE)
    val stats = mutableListOf<ColumnStats>()

    for (c in 0 until colCount) {
        var total = 0
        var emptyCount = 0
        var dateCount = 0
        var moneyCount = 0
        var textCount = 0
        var moneySum = 0.0
        val moneyValues = mutableListOf<Long?>()

        for (row in sample) {
            val cell = row.getOrElse(c) { "" }
            total++
            if (cell == "") {
                emptyCount++
                moneyValues.add(null)
                continue
            }
            if (looksLikeDate(cell)) dateCount++
            val cents = parseMoneyToCents(cell)
            if (cents != null) {
                moneyCount++
                moneySum += abs(cents.toDouble())
                moneyValues.add(cents)
            } else {
                moneyValues.add(null)
                // "Text" = has letters, isn't purely numeric/punctuation.
                if (Regex("[A-Za-z]").containsMatchIn(cell)) textCount++
            }
        }

        stats.add(
            ColumnStats(
                index = c,
                total = total,
                emptyCount = emptyCount,
                dateCount = dateCount,
                moneyCount = moneyCount,
                textCount = textCount,
                moneyValues = moneyValues,
                meanAbsMoney = if (moneyCount > 0) moneySum / moneyCount else 0.0
            )
        )
    }

    return stats
}

/**
 * Given a raw matrix (already known to be data rows, no header), work out
 * which column is which by content shape and return a full structural layout
 * with a confidence score.
 */
fun detectStructure(rawRows: List<List<String>>): StructuralLayout {
    val warnings = mutableListOf<String>()
    if (rawRows.isEmpty()) {
        return StructuralLayout(
            hasHeader = false, headerRow = null, dataRows = emptyList(), columns = emptyList(),
            dateCol = null, descriptionCol = null, amountCol = null, debitCol = null, creditCol = null,
            balanceCol = null, confidence = 0.0, warnings = listOf("The file has no rows.")
        )
    }

    val hasHeader = detectHeader(rawRows)
    val headerRow = if (hasHeader) rawRows[0] else null
    val dataRows = if (hasHeader) rawRows.drop(1) else rawRows

    val colCount = maxOf(dataRows.maxOfOrNull { it.size } ?: 0, rawRows.getOrNull(0)?.size ?: 0)
    val stats = profileColumns(dataRows, colCount)
    val rowsSampled = minOf(dataRows.size, SAMPLE_SIZE)

    // --- date column: highest date-hit fraction, must clear a real threshold ---
    var dateCol: Int? = null
    var dateScore = 0.0
    for (s in stats) {
        val populated = s.total - s.emptyCount
        val score = fraction(s.dateCount, maxOf(1, populated))
        if (populated > 0 && score > dateScore) {
            dateScore = score
            dateCol = s.index
        }
    }
    if (dateScore < 0.6) {
        dateCol = null
        warnings.add("Could not confidently identify a date column.")
    }

    // --- money-shaped columns (excluding the date column) ---
    val moneyCols = stats.filter { s ->
        if (s.index == dateCol) {
            false
        } else {
            val populated = s.total - s.emptyCount
            populated > 0 && fraction(s.moneyCount, populated) > 0.6
        }
    }

    // A real transaction amount/debit/credit/balance column varies row to row. A column
    // that merely *parses* as a number but barely varies is an identifier, not a
    // monetary value — exclude it from candidacy.
    val transactionMoneyCols = moneyCols.filter { s ->
        val values = s.moneyValues.filterNotNull()
        if (values.size < 3) {
            true
        } else {
            val distinctFrac = fraction(values.toSet().size, values.size)
            distinctFrac > 0.3
        }
    }

    // --- description column: most text-heavy, not money/date-shaped ---
    var descriptionCol: Int? = null
    var descScore = -1.0
    for (s in stats) {
        if (s.index == dateCol) continue
        if (moneyCols.any { it.index == s.index }) continue
        val populated = s.total - s.emptyCount
        val score = fraction(s.textCount, maxOf(1, populated))
        if (populated > 0 && score > descScore) {
            descScore = score
            descriptionCol = s.index
        }
    }
    // Fall back: sometimes description also contains numbers/refs and scored low against a
    // stricter money column — pick the least money-like, non-date column with real content.
    if (descriptionCol == null) {
        var best: ColumnStats? = null
        var bestPopulated = -1
        for (s in stats) {
            if (s.index == dateCol) continue
            if (moneyCols.any { it.index == s.index }) continue
            val populated = s.total - s.emptyCount
            if (populated > bestPopulated) {
                bestPopulated = populated
                best = s
            }
        }
        descriptionCol = best?.index
        if (descriptionCol == null) warnings.add("Could not confidently identify a description column.")
    }

    // --- split remaining money columns into amount / debit+credit / balance ---
    var amountCol: Int? = null
    var debitCol: Int? = null
    var creditCol: Int? = null
    var balanceCol: Int? = null

    val remaining = transactionMoneyCols.sortedByDescending { it.meanAbsMoney }

    // Balance: mostly-populated and much larger in magnitude than the *individual*
    // transaction values around it. Compare against the MEDIAN of the other columns'
    // pooled values, not their per-column means. Try candidates largest-magnitude-first.
    for (candidate in remaining) {
        val others = remaining.filter { it.index != candidate.index }
        if (others.isEmpty()) break

        val populatedFrac = fraction(candidate.total - candidate.emptyCount, candidate.total)
        val pool = others.flatMap { it.moneyValues.filterNotNull() }.map { abs(it) }.sorted()
        val medianOthers = if (pool.isNotEmpty()) pool[pool.size / 2] else 0L
        val isMuchLarger = if (medianOthers == 0L) true else candidate.meanAbsMoney > medianOthers * 2.5

        if (populatedFrac > 0.85 && isMuchLarger) {
            balanceCol = candidate.index
            break
        }
    }

    val nonBalance = remaining.filter { it.index != balanceCol }

    if (nonBalance.size == 1) {
        // Single signed amount column.
        amountCol = nonBalance[0].index
    } else if (nonBalance.size >= 2) {
        // Look for a debit/credit pair: each mostly-empty, and rarely both populated on
        // the same row (roughly complementary).
        var bestPair: Pair<ColumnStats, ColumnStats>? = null
        var bestComplementarity = -1.0
        for (i in nonBalance.indices) {
            for (j in i + 1 until nonBalance.size) {
                val a = nonBalance[i]
                val b = nonBalance[j]
                // A column that's blank in ZERO rows (a real amount/balance column always
                // is) can never legitimately be one side of a split pair.
                if (a.emptyCount == 0 || b.emptyCount == 0) continue
                var bothPopulated = 0
                var eitherPopulated = 0
                for (r in a.moneyValues.indices) {
                    val av = a.moneyValues[r]
                    val bv = b.moneyValues.getOrNull(r)
                    if (av != null || bv != null) eitherPopulated++
                    if (av != null && bv != null) bothPopulated++
                }
                val complementarity = if (eitherPopulated == 0) 0.0 else 1.0 - bothPopulated.toDouble() / eitherPopulated
                if (complementarity > bestComplementarity) {
                    bestComplementarity = complementarity
                    bestPair = a to b
                }
            }
        }
        if (bestPair != null && bestComplementarity > 0.7) {
            // Which is debit (spend) vs credit (income)? Without a balance column to
            // verify, fall back to "more frequently populated = debit".
            val (a, b) = bestPair
            val aPopulated = a.total - a.emptyCount
            val bPopulated = b.total - b.emptyCount
            if (aPopulated >= bPopulated) {
                debitCol = a.index
                creditCol = b.index
            } else {
                debitCol = b.index
                creditCol = a.index
            }
            if (balanceCol == null) {
                warnings.add("Debit/credit columns were guessed without a balance column to verify against — please confirm the sign convention below.")
            }
        } else {
            // Ambiguous — pick the most fully-populated as amount, warn.
            val sorted = nonBalance.sortedBy { it.emptyCount }
            amountCol = sorted.getOrNull(0)?.index
            warnings.add("Multiple numeric columns were found and the amount column was guessed — please verify in the preview.")
        }
    }

    // --- confidence ---
    var confidence = 0.0
    if (dateCol != null) confidence += 0.35
    if (descriptionCol != null) confidence += 0.15
    if (amountCol != null) {
        confidence += 0.35
    } else if (debitCol != null && creditCol != null) {
        confidence += if (balanceCol != null) 0.35 else 0.25
    }
    if (balanceCol != null) confidence += 0.15
    confidence = minOf(1.0, confidence)

    if (rowsSampled < 3) {
        confidence = minOf(confidence, 0.5)
        warnings.add("Very few rows to sample — structural detection may be unreliable.")
    }

    val columns = stats.map { s ->
        val role = when (s.index) {
            dateCol -> ColumnRole.DATE
            descriptionCol -> ColumnRole.DESCRIPTION
            amountCol -> ColumnRole.AMOUNT
            debitCol -> ColumnRole.DEBIT
            creditCol -> ColumnRole.CREDIT
            balanceCol -> ColumnRole.BALANCE
            else -> ColumnRole.UNKNOWN
        }
        ColumnProfile(s.index, role, 1.0)
    }

    return StructuralLayout(
        hasHeader = hasHeader,
        headerRow = headerRow,
        dataRows = dataRows,
        columns = columns,
        dateCol = dateCol,
        descriptionCol = descriptionCol,
        amountCol = amountCol,
        debitCol = debitCol,
        creditCol = creditCol,
        balanceCol = balanceCol,
        confidence = confidence,
        warnings = warnings
    )
}
