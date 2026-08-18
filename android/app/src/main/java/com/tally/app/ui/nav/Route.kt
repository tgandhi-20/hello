package com.tally.app.ui.nav

import com.tally.app.money.AccountId

/**
 * This app's whole navigation graph — deliberately a plain sealed class and
 * a hand-managed back stack (see `TallyApp.kt`) rather than the
 * `androidx.navigation:navigation-compose` library: three real destinations
 * plus a handful of not-yet-built Menu rows don't need a second dependency
 * this build can't compile-check locally before shipping.
 */
sealed class Route {
    /** One of the three bottom-nav destinations. */
    data object Home : Route()
    data object QuickAdd : Route()
    data object Menu : Route()

    /** Reachable from Menu's "All transactions" row. */
    data object Transactions : Route()

    // Screens reachable from Menu. Each is a real destination now; the
    // Placeholder entries they replaced rendered a title and a subtitle and
    // nothing else, which is indistinguishable from a working screen with no
    // data in it — precisely the confusion this app has to avoid.
    /** The Spend tab — categories for a month (DESIGN-V5 section 3). */
    data object Spend : Route()

    /** One account's transactions, reached by tapping an account on Home. */
    data class Account(val accountId: AccountId) : Route()

    /** One transaction's detail, reached from any transaction row. */
    data class TxnDetail(val txnId: String) : Route()

    data object Budgets : Route()
    data object Goal : Route()
    data object Recurring : Route()
    data object CsvImport : Route()
    data object Statements : Route()
    data object CaptureReview : Route()
    data object NotificationAccess : Route()
    data object Settings : Route()

    /** The plain-English explainer (DESIGN-V4 section 4.3). */
    data object HowTallyWorks : Route()

    /**
     * Every other Menu row, and Home's "Deposit plan"/"To sort out" rows,
     * point here for now — a real destination, not a dead tap, while the
     * money/vault agents' features it will eventually show get built out.
     */
    data class Placeholder(val title: String, val subtitle: String) : Route()
}
