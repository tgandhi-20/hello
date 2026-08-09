package com.tally.app.csvimport

/**
 * Low-level CSV parsing: delimiter sniffing and raw-matrix extraction.
 * Ported from src/import/csv.ts (which used papaparse; this is a from-scratch
 * Kotlin tokenizer since no CSV library dependency is allowed in this layer).
 * No column semantics here — see Columns.kt for structural role detection.
 */
data class RawCsv(
    /** Every row as a list of trimmed string cells. Ragged rows are padded with "". */
    val rows: List<List<String>>,
    val delimiter: Char,
    /** Parse errors worth showing as warnings. Always empty for this tokenizer
     *  (it never throws on malformed quoting — ragged/ambiguous input degrades
     *  gracefully into extra/short fields instead). */
    val errors: List<String>
)

private val CANDIDATE_DELIMITERS = listOf(',', ';', '\t', '|')

/** Count [delimiter] occurrences in [line] that are outside a quoted span. */
private fun countUnquoted(line: String, delimiter: Char): Int {
    var count = 0
    var inQuotes = false
    for (c in line) {
        if (c == '"') {
            inQuotes = !inQuotes
        } else if (c == delimiter && !inQuotes) {
            count++
        }
    }
    return count
}

/**
 * Guess the delimiter from a sample of non-blank lines: for each candidate,
 * find the modal (most common) per-line count, and score it by how
 * consistently that count recurs, weighted by the count itself (so a
 * delimiter that appears 4 times per line consistently beats one that
 * appears once per line consistently — a wider matrix is a stronger signal).
 */
private fun sniffDelimiter(sampleLines: List<String>): Char {
    var best = ','
    var bestScore = -1.0
    for (d in CANDIDATE_DELIMITERS) {
        val counts = sampleLines.map { countUnquoted(it, d) }
        if (counts.isEmpty() || counts.all { it == 0 }) continue
        val mode = counts.groupingBy { it }.eachCount().maxByOrNull { it.value } ?: continue
        if (mode.key == 0) continue
        val consistency = mode.value.toDouble() / counts.size
        val score = consistency * mode.key
        if (score > bestScore) {
            bestScore = score
            best = d
        }
    }
    return best
}

/** RFC4180-ish tokenizer: [delimiter]-separated fields, `"`-quoted with `""` escaping,
 *  quoted fields may contain the delimiter or newlines. `\n` outside quotes ends a row. */
private fun tokenizeCsv(text: String, delimiter: Char): List<List<String>> {
    val rows = mutableListOf<List<String>>()
    var row = mutableListOf<String>()
    val field = StringBuilder()
    var inQuotes = false
    var i = 0
    val n = text.length

    while (i < n) {
        val c = text[i]
        if (inQuotes) {
            when {
                c == '"' && i + 1 < n && text[i + 1] == '"' -> {
                    field.append('"')
                    i += 2
                }
                c == '"' -> {
                    inQuotes = false
                    i++
                }
                else -> {
                    field.append(c)
                    i++
                }
            }
        } else {
            when (c) {
                '"' -> {
                    inQuotes = true
                    i++
                }
                delimiter -> {
                    row.add(field.toString())
                    field.clear()
                    i++
                }
                '\n' -> {
                    row.add(field.toString())
                    field.clear()
                    rows.add(row)
                    row = mutableListOf()
                    i++
                }
                else -> {
                    field.append(c)
                    i++
                }
            }
        }
    }
    if (field.isNotEmpty() || row.isNotEmpty()) {
        row.add(field.toString())
        rows.add(row)
    }
    return rows
}

/**
 * Parse raw CSV/TSV text into a rectangular matrix of trimmed string cells.
 * Delimiter is sniffed from `[',', ';', '\t', '|']`. Blank/whitespace-only
 * rows are dropped ("greedy" empty-line skipping, matching papaparse's
 * `skipEmptyLines: 'greedy'`).
 */
fun parseRawCsv(text: String): RawCsv {
    val normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    val allLines = normalized.split("\n")
    val sampleLines = allLines.filter { it.isNotBlank() }.take(10)
    val delimiter = sniffDelimiter(sampleLines)

    val rawRows = tokenizeCsv(normalized, delimiter)
    val nonEmptyRows = rawRows.filter { row -> row.any { it.trim().isNotEmpty() } }

    val width = nonEmptyRows.maxOfOrNull { it.size } ?: 0
    val rows = nonEmptyRows.map { row ->
        val cells = row.take(width).map { it.trim() }.toMutableList()
        while (cells.size < width) cells.add("")
        cells.toList()
    }

    return RawCsv(rows, delimiter, emptyList())
}
