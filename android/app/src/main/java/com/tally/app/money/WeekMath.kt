package com.tally.app.money

import java.time.LocalDate

/**
 * Monday-start week arithmetic. Ported from src/features/food/weekMath.ts —
 * "Week runs Monday-Sunday (AU)" (docs/PERSONAL.md §4). Pure `LocalDate`
 * arithmetic; no UTC-parsing trap is even possible here since `LocalDate` has
 * no timezone component.
 */

/** Monday-first weekday index for a date: 0=Mon, 1=Tue, … 6=Sun. */
fun mondayIndexOf(date: LocalDate): Int = date.dayOfWeek.value - 1

data class WeekWindow(
    /** Monday of the week containing the date. */
    val weekStart: LocalDate,
    /** Sunday of the week containing the date. */
    val weekEnd: LocalDate,
    /** The date's position within its week: 0=Mon … 6=Sun. */
    val dayIndex: Int,
    /** Days elapsed so far this week, the date counted as elapsed. Always 1..7. */
    val daysElapsed: Int,
    /** Days left in the week, the date counted as remaining. Always 1..7, never 0. */
    val daysLeft: Int
)

/** The Monday-Sunday week window containing [date]. */
fun weekWindowFor(date: LocalDate): WeekWindow {
    val dayIndex = mondayIndexOf(date)
    val weekStart = date.minusDays(dayIndex.toLong())
    val weekEnd = weekStart.plusDays(6)
    return WeekWindow(
        weekStart = weekStart,
        weekEnd = weekEnd,
        dayIndex = dayIndex,
        daysElapsed = dayIndex + 1,
        daysLeft = 7 - dayIndex
    )
}

/** The Monday-Sunday bounds of the week immediately before the one starting [weekStart]. */
fun previousWeekBounds(weekStart: LocalDate): Pair<LocalDate, LocalDate> {
    val prevStart = weekStart.minusDays(7)
    return prevStart to prevStart.plusDays(6)
}

/** Whether [date] falls within `[weekStart, weekEnd]` inclusive. */
fun isInWeek(date: LocalDate, weekStart: LocalDate, weekEnd: LocalDate): Boolean =
    !date.isBefore(weekStart) && !date.isAfter(weekEnd)
