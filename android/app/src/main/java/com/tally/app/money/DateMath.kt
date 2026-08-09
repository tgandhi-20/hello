package com.tally.app.money

import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.max

/**
 * Days remaining in [month], counting [today] as remaining (i.e. "today
 * included"), always >= 1 for the month containing [today] so a same-day
 * divide is never by zero. A past month collapses to 0; a future month
 * returns its full length.
 *
 * Ported from src/money/index.ts's own LOCAL `daysRemainingInMonth` — NOT
 * src/features/insights/monthMath.ts's same-named export, which hardcodes the
 * real system clock and has no injectable `today`. This version takes an
 * explicit `today` for the same reason the original does: the whole money
 * model must stay testable against a fixed date, never the real calendar day
 * the test happens to run on.
 */
fun daysRemainingInMonth(month: YearMonth, today: LocalDate): Int {
    val total = month.lengthOfMonth()
    val todayMonth = YearMonth.from(today)
    if (month > todayMonth) return total
    if (month < todayMonth) return 0
    return max(1, total - today.dayOfMonth + 1)
}

/** Whole days from [from] to [to] (negative if [to] has already passed). */
fun daysBetween(from: LocalDate, to: LocalDate): Int = ChronoUnit.DAYS.between(from, to).toInt()
