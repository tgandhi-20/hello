package com.tally.app.ui.model

import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private val AU_LOCALE: Locale = Locale.Builder().setLanguage("en").setRegion("AU").build()
private val WEEKDAY_SHORT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE", AU_LOCALE)
private val DAY_MONTH_SHORT: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", AU_LOCALE)
private val MONTH_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("MMMM yyyy", AU_LOCALE)

/**
 * Group (already newest-first) transactions by calendar day, with a
 * per-day subtotal — a straight port of `src/features/transactions/selectors.ts`'s
 * `groupByDay`. Display grouping, not a money calculation: it sums figures
 * that already exist on each transaction, the same way the web version's
 * day-subtotal header does.
 */
fun groupTxnsByDay(txns: List<UiTxn>): List<UiDayGroup> {
    val sorted = txns.sortedByDescending { it.date }
    val groups = mutableListOf<UiDayGroup>()
    var currentDate: LocalDate? = null
    var currentTxns = mutableListOf<UiTxn>()
    var currentSubtotal = 0L

    fun flush() {
        val date = currentDate ?: return
        groups.add(UiDayGroup(date, currentTxns.toList(), currentSubtotal))
    }

    for (t in sorted) {
        if (currentDate == null || currentDate != t.date) {
            flush()
            currentDate = t.date
            currentTxns = mutableListOf()
            currentSubtotal = 0L
        }
        currentTxns.add(t)
        currentSubtotal += t.amountCents
    }
    flush()
    return groups
}

/** Search + month filter — AND-combined, mirrors `filterTxns` in the web app. */
fun filterTxns(txns: List<UiTxn>, query: String, month: YearMonth?): List<UiTxn> {
    val q = query.trim().lowercase(AU_LOCALE)
    return txns.filter { t ->
        if (month != null && YearMonth.from(t.date) != month) return@filter false
        if (q.isNotEmpty()) {
            val haystack = "${t.merchant} ${t.note.orEmpty()}".lowercase(AU_LOCALE)
            if (!haystack.contains(q)) return@filter false
        }
        true
    }
}

/** `"Today"`, `"Yesterday"`, or `"Mon 3 Aug"` — mirrors `formatRelativeDay`. */
fun formatRelativeDay(date: LocalDate, today: LocalDate = LocalDate.now()): String = when (date) {
    today -> "Today"
    today.minusDays(1) -> "Yesterday"
    else -> "${WEEKDAY_SHORT.format(date)} ${DAY_MONTH_SHORT.format(date)}"
}

/** `"August 2026"` for the month-navigation header. */
fun formatMonthLabel(month: YearMonth): String = MONTH_LABEL.format(month.atDay(1))
