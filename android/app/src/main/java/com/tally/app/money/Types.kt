package com.tally.app.money

import java.time.LocalDate

/**
 * Tally — shared money-model type contracts. Ported from src/types.ts.
 *
 * MONEY IS INTEGER Long CENTS. Never Double, never Float. `2450L` is $24.50.
 *
 * Dates are `java.time.LocalDate` — local calendar dates, never UTC millis and
 * never `java.util.Date`. The original TypeScript has an explicit warning that
 * `new Date(dateStr)` parses as UTC and shifts Australian local dates by a day
 * for the first ~10 hours of every AEST/AEDT day; `LocalDate` has no timezone
 * component at all, so that whole class of bug is structurally impossible here.
 */
typealias Cents = Long

/**
 * `CBA` is the CBA everyday/transaction account. `CBA_CARD` is a CBA credit
 * card — split out because a card has a due date/closing cycle that an
 * everyday account doesn't (see src/types.ts's own doc comment on this split).
 */
enum class AccountId(val id: String) {
    CBA("cba"),
    CBA_CARD("cba-card"),
    BANKWEST("bankwest"),
    AMEX("amex"),
    CASH("cash");

    companion object {
        fun fromId(id: String): AccountId? = entries.find { it.id == id }
    }
}

enum class TxnSource { MANUAL, CSV }

enum class CategoryKind { NEED, WANT, SAVE }

enum class RecurringCadence(val id: String) {
    WEEKLY("weekly"),
    FORTNIGHTLY("fortnightly"),
    MONTHLY("monthly"),
    QUARTERLY("quarterly"),
    YEARLY("yearly")
}

data class Category(
    val id: String,
    val label: String,
    /** lucide-react icon name in the web app; kept as a plain string here — no
     *  Android drawable resolution happens in this layer. */
    val icon: String,
    /** Design-token name (e.g. `"cat-3"`), never a raw hex/color. */
    val colorToken: String,
    val kind: CategoryKind,
    val builtin: Boolean,
    val order: Int
)

data class Txn(
    val id: String,
    val date: LocalDate,
    /** Positive = spend, negative = income. Integer cents. */
    val amountCents: Cents,
    /** Raw text as it appeared, or what the user typed. */
    val description: String,
    /** Cleaned merchant name used for matching and display. */
    val merchant: String,
    val categoryId: String,
    val account: AccountId,
    val source: TxnSource,
    /** sha256(date|amountCents|normalisedDescription|account|occurrence) — import dedupe key. */
    val hash: String,
    val note: String? = null,
    /** Excluded from budgets/insights (e.g. a reimbursed expense, an internal transfer). */
    val excluded: Boolean = false,
    /** Set when this txn was matched into a detected recurring series. */
    val recurringId: String? = null,
    val createdAt: Long = 0,
    val updatedAt: Long = 0
)

data class RecurringSeries(
    val id: String,
    val merchant: String,
    val categoryId: String,
    val cadence: RecurringCadence,
    /** Typical amount, integer cents. */
    val amountCents: Cents,
    /** Most recent occurrence. */
    val lastSeen: LocalDate,
    /** Projected next occurrence. */
    val nextDue: LocalDate,
    /** Transaction ids belonging to this series. */
    val txnIds: List<String> = emptyList(),
    /** Positive cents if the charge has crept up vs. its earlier baseline. */
    val priceIncreaseCents: Cents? = null,
    /** User dismissed this from the radar. */
    val muted: Boolean = false,
    /** User explicitly confirmed this series as a real recurring commitment —
     *  see `isBillSeries` in MonthMoney.kt for why this matters. */
    val confirmed: Boolean = false
)

data class Settings(
    val currency: String = "AUD",
    val locale: String = "en-AU",
    /** Day of month income lands. */
    val paydayDayOfMonth: Int = 15,
    /** Expected monthly take-home, integer cents. 0 = unknown. */
    val monthlyIncomeCents: Cents = 0,
    /** Monthly savings target, integer cents. */
    val savingsTargetCents: Cents = 0,
    val lockTimeoutMs: Long = 120_000,
    val biometricEnabled: Boolean = false,
    val pinnedCategoryIds: List<String> = emptyList(),
    val moveInDate: LocalDate? = null,
    val hasHecsDebt: Boolean? = null,
    /** The user's actual savings balance, as they last told us. `null` = never
     *  entered, in which case the goal card falls back to the projected figure. */
    val goalCurrentBalanceCents: Cents? = null
)
