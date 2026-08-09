package com.tally.app.csvimport

import java.time.DateTimeException
import java.time.LocalDate

/**
 * Date parsing for CSV import. Ported from src/import/dates.ts. Tries, in
 * order: `DD/MM/YYYY` / `DD/MM/YY` (day-first, never month-first), ISO
 * `YYYY-MM-DD`, and `DD Mon YYYY` / `DD-Mon-YYYY`.
 *
 * KOTLIN DEVIATION (documented, deliberate): dates here are real
 * `java.time.LocalDate` values, not strings. The original TypeScript
 * `parseAuDate`/`tryParseDate` only range-check month (1-12) and day (1-31)
 * — they never validate that a day is real for its actual month, so
 * `parseAuDate("31/02/2026")` happily returns the STRING `"2026-02-31"`, a
 * calendar date that does not exist. `LocalDate.of(...)` throws
 * `DateTimeException` for that same input, which this module catches and
 * turns into `null` — i.e. this port REJECTS a garbage date the original
 * would have silently manufactured. This is a strictly safer behaviour (an
 * invalid calendar date can never end up masquerading as a `Txn.date`), but
 * it is a genuine, intentional divergence from the TS source's leniency —
 * flagged here rather than left implicit.
 */

private val ISO_RE = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$")

private val MONTH_NAMES: Map<String, Int> = mapOf(
    "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
    "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12
)
private val MONTH_NAME_RE = Regex("^(\\d{1,2})[\\s-]([A-Za-z]{3,})[\\s-](\\d{2,4})$")

/**
 * Parse a date string that appears in an AU bank CSV export. Returns `null`
 * (never throws) so callers can use it for column sniffing.
 */
fun tryParseDate(raw: String?): LocalDate? {
    if (raw == null) return null
    val s = raw.trim()
    if (s.isEmpty()) return null

    val iso = ISO_RE.find(s)
    if (iso != null) {
        val y = iso.groupValues[1].toInt()
        val m = iso.groupValues[2].toInt()
        val d = iso.groupValues[3].toInt()
        if (m in 1..12 && d in 1..31) {
            return try {
                LocalDate.of(y, m, d)
            } catch (e: DateTimeException) {
                null
            }
        }
        return null
    }

    val named = MONTH_NAME_RE.find(s)
    if (named != null) {
        val dRaw = named.groupValues[1]
        val monRaw = named.groupValues[2]
        val yRaw = named.groupValues[3]
        val mon = MONTH_NAMES[monRaw.take(3).lowercase()]
        if (mon != null) {
            val day = dRaw.toInt()
            var year = yRaw.toInt()
            if (yRaw.length == 2) year = if (year <= 69) 2000 + year else 1900 + year
            if (day in 1..31) {
                return try {
                    LocalDate.of(year, mon, day)
                } catch (e: DateTimeException) {
                    null
                }
            }
        }
        return null
    }

    return try {
        parseAuDate(s)
    } catch (e: Exception) {
        null
    }
}

/** True if the string parses as a recognisable date (used for column/header sniffing). */
fun looksLikeDate(raw: String?): Boolean = tryParseDate(raw) != null

/**
 * Parse an Australian-formatted date string (`DD/MM/YYYY` or `DD/MM/YY`) — as
 * found in CBA/Bankwest/Amex CSV exports — into a `LocalDate`. Two-digit
 * years pivot at 70: `00`-`69` -> `2000`-`2069`, `70`-`99` -> `1970`-`1999`.
 * Throws if the string isn't a recognisable `DD/MM/YYYY`-family date, or
 * isn't a real calendar date (see this file's top-of-file doc comment).
 */
fun parseAuDate(s: String): LocalDate {
    val trimmed = s.trim()
    val match = Regex("^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2}|\\d{4})$").find(trimmed)
        ?: throw IllegalArgumentException("parseAuDate: unrecognised date \"$s\"")
    val day = match.groupValues[1].toInt()
    val month = match.groupValues[2].toInt()
    var year = match.groupValues[3].toInt()

    if (match.groupValues[3].length == 2) {
        year = if (year <= 69) 2000 + year else 1900 + year
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw IllegalArgumentException("parseAuDate: date out of range \"$s\"")
    }

    return LocalDate.of(year, month, day)
}

/** Compare two dates: negative if a < b, positive if a > b, 0 if equal. */
fun compareDateStr(a: LocalDate, b: LocalDate): Int = a.compareTo(b)
