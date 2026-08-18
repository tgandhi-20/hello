package com.tally.app.ui.model

import com.tally.app.categorize.normaliseForMatch
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
fun filterTxns(txns: List<UiTxn>, query: String, month: YearMonth?): List<UiTxn> =
    txns.filter { t ->
        if (month != null && YearMonth.from(t.date) != month) return@filter false
        matchesTxnSearch(t, query)
    }

/**
 * Case- and punctuation-insensitive search predicate over merchant,
 * description, note and amount — pure, independently testable (see
 * TransactionsTest), and the single place this app decides whether a
 * transaction matches a typed query. Reuses `categorize.normaliseForMatch`
 * for every text field rather than a second, competing normaliser
 * (docs/AGENT-BRIEF.md section 1's own warning about exactly that
 * duplication) — so `"campos"` matches `"Campos Coffee"` and `"CAMPOS"`
 * alike. The amount is matched separately, as a plain dollars-and-cents
 * token (`"23.50"`), never pushed through the merchant-cleanup pipeline,
 * which is meant for bank noise, not digits.
 */
fun matchesTxnSearch(txn: UiTxn, query: String): Boolean {
    val q = normaliseForMatch(query)
    if (q.isEmpty()) return true
    if (normaliseForMatch(txn.merchant).contains(q)) return true
    val description = txn.description
    if (description != null && normaliseForMatch(description).contains(q)) return true
    val note = txn.note
    if (note != null && normaliseForMatch(note).contains(q)) return true
    return amountSearchToken(txn.amountCents).contains(q)
}

/**
 * `"$23.50"` for `2350L`, `"$5.00"` for `-500L` — sign dropped, since search
 * is about the figure, not the direction. Integer arithmetic only, no
 * `NumberFormat`/`Locale`, so the token never drifts with the environment.
 */
private fun amountSearchToken(cents: Cents): String {
    val absCents = if (cents < 0) -cents else cents
    val dollars = absCents / 100
    val remainder = (absCents % 100).toString().padStart(2, '0')
    return "\$$dollars.$remainder"
}

/**
 * Running balance per row, oldest -> newest — the figure a bank statement
 * shows beside every transaction (docs/DESIGN-V5.md section 1/section 2).
 * Pure function, no data-source access (see TransactionsTest for coverage).
 *
 * Call this with ONE account's transactions only — mixing accounts here
 * would sum unrelated balances into one meaningless number. Same-day
 * transactions keep their relative order from [txns] (stable sort on
 * date), so the result agrees with whatever order a day-grouped list
 * already displays them in, regardless of what order [txns] itself arrives
 * in (newest-first, as `TallyDataSource.transactions` provides, or any
 * other order).
 *
 * Sign convention (`money/Types.kt`): positive `amountCents` = spend
 * (reduces the balance), negative = income (increases it) — so each step
 * is `balance -= amountCents`.
 *
 * The starting point is zero, not a bank-fed opening balance: Tally only
 * ever knows what has been imported or logged (docs/DESIGN-V5.md section
 * 2), so this is a DERIVED figure — the sum of what has been imported for
 * this account — never a claim about the real account balance.
 */
fun computeRunningBalances(txns: List<UiTxn>): Map<String, Cents> {
    val chronological = txns.withIndex().sortedWith(compareBy({ it.value.date }, { it.index }))
    var balance = 0L
    val result = LinkedHashMap<String, Cents>()
    for ((_, txn) in chronological) {
        balance -= txn.amountCents
        result[txn.id] = balance
    }
    return result
}

/** `"Today"`, `"Yesterday"`, or `"Mon 3 Aug"` — mirrors `formatRelativeDay`. */
fun formatRelativeDay(date: LocalDate, today: LocalDate = LocalDate.now()): String = when (date) {
    today -> "Today"
    today.minusDays(1) -> "Yesterday"
    else -> "${WEEKDAY_SHORT.format(date)} ${DAY_MONTH_SHORT.format(date)}"
}

/** `"August 2026"` for the month-navigation header. */
fun formatMonthLabel(month: YearMonth): String = MONTH_LABEL.format(month.atDay(1))
