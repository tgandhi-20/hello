package com.tally.app.data

import com.tally.app.util.JsonValue
import com.tally.app.util.getBoolean
import com.tally.app.util.getInt
import com.tally.app.util.getLong
import com.tally.app.util.getString
import com.tally.app.util.jsonObject
import com.tally.app.util.optArray
import com.tally.app.util.optBoolean
import com.tally.app.util.optBooleanOrNull
import com.tally.app.util.optLongOrNull
import com.tally.app.util.optObject
import com.tally.app.util.optString
import com.tally.app.util.optStringOrNull

/**
 * Tally — Kotlin mirrors of src/types.ts's shared contracts (ORCHESTRATOR-
 * OWNED there — read only, not editable from this module). Field names
 * match EXACTLY: these are also what a `.tally` backup produced by the web
 * app contains (see Backup.kt), so JSON produced/consumed here has to speak
 * the same shape byte for byte at the field level.
 *
 * MONEY IS `Long` CENTS, EVERYWHERE. Never Double, Float, or BigDecimal —
 * see JsonValue.Num.asLong() in util/Json.kt for why integer literals are
 * parsed straight from their digits rather than via Double, so a value
 * beyond 2^53 never loses precision.
 */

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

data class Category(
    val id: String,
    val label: String,
    /** icon name, e.g. 'Coffee' — rendering is the ui/ agent's concern. */
    val icon: String,
    /** Token name from the 12-swatch category ramp, e.g. 'cat-1'. Never a raw hex. */
    val colorToken: String,
    /** 'need' | 'want' | 'save' */
    val kind: String,
    val builtin: Boolean,
    val order: Int,
)

fun Category.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("label", label)
    put("icon", icon)
    put("colorToken", colorToken)
    put("kind", kind)
    put("builtin", builtin)
    put("order", order)
}

fun categoryFromJson(o: JsonValue.Obj): Category = Category(
    id = o.getString("id"),
    label = o.getString("label"),
    icon = o.getString("icon"),
    colorToken = o.getString("colorToken"),
    kind = o.getString("kind"),
    builtin = o.getBoolean("builtin"),
    order = o.getInt("order"),
)

// ---------------------------------------------------------------------------
// Txn
// ---------------------------------------------------------------------------

data class Txn(
    val id: String,
    /** YYYY-MM-DD, local. */
    val date: String,
    /** Positive = spend, negative = income. Integer cents. */
    val amountCents: Long,
    val description: String,
    val merchant: String,
    val categoryId: String,
    /** 'cba' | 'cba-card' | 'bankwest' | 'amex' | 'cash' */
    val account: String,
    /** 'manual' | 'csv' */
    val source: String,
    /** sha256(date|amountCents|normalisedDescription|account|occurrence) — import dedupe key. */
    val hash: String,
    val note: String? = null,
    val excluded: Boolean? = null,
    val recurringId: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
)

fun Txn.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("date", date)
    put("amountCents", amountCents)
    put("description", description)
    put("merchant", merchant)
    put("categoryId", categoryId)
    put("account", account)
    put("source", source)
    put("hash", hash)
    note?.let { put("note", it) }
    excluded?.let { put("excluded", it) }
    recurringId?.let { put("recurringId", it) }
    put("createdAt", createdAt)
    put("updatedAt", updatedAt)
}

fun txnFromJson(o: JsonValue.Obj): Txn = Txn(
    id = o.getString("id"),
    date = o.getString("date"),
    amountCents = o.getLong("amountCents"),
    description = o.getString("description"),
    merchant = o.getString("merchant"),
    categoryId = o.getString("categoryId"),
    account = o.getString("account"),
    source = o.getString("source"),
    hash = o.getString("hash"),
    note = o.optStringOrNull("note"),
    excluded = o.optBooleanOrNull("excluded"),
    recurringId = o.optStringOrNull("recurringId"),
    createdAt = o.getLong("createdAt"),
    updatedAt = o.getLong("updatedAt"),
)

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

data class Budget(
    val categoryId: String,
    /** YYYY-MM */
    val month: String,
    val limitCents: Long,
)

fun Budget.toJson(): JsonValue.Obj = jsonObject {
    put("categoryId", categoryId)
    put("month", month)
    put("limitCents", limitCents)
}

fun budgetFromJson(o: JsonValue.Obj): Budget = Budget(
    categoryId = o.getString("categoryId"),
    month = o.getString("month"),
    limitCents = o.getLong("limitCents"),
)

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

data class Rule(
    val id: String,
    /** Lowercased substring matched against the normalised merchant. */
    val match: String,
    val categoryId: String,
    val createdAt: Long,
)

fun Rule.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("match", match)
    put("categoryId", categoryId)
    put("createdAt", createdAt)
}

fun ruleFromJson(o: JsonValue.Obj): Rule = Rule(
    id = o.getString("id"),
    match = o.getString("match"),
    categoryId = o.getString("categoryId"),
    createdAt = o.getLong("createdAt"),
)

// ---------------------------------------------------------------------------
// RecurringSeries
// ---------------------------------------------------------------------------

data class RecurringSeries(
    val id: String,
    val merchant: String,
    val categoryId: String,
    /** 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' */
    val cadence: String,
    val amountCents: Long,
    val lastSeen: String,
    val nextDue: String,
    val txnIds: List<String>,
    val priceIncreaseCents: Long? = null,
    val muted: Boolean? = null,
)

fun RecurringSeries.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("merchant", merchant)
    put("categoryId", categoryId)
    put("cadence", cadence)
    put("amountCents", amountCents)
    put("lastSeen", lastSeen)
    put("nextDue", nextDue)
    putArray("txnIds", txnIds)
    priceIncreaseCents?.let { put("priceIncreaseCents", it) }
    muted?.let { put("muted", it) }
}

fun recurringFromJson(o: JsonValue.Obj): RecurringSeries {
    val ids = o.optArray("txnIds")?.map { (it as JsonValue.Str).value } ?: emptyList()
    return RecurringSeries(
        id = o.getString("id"),
        merchant = o.getString("merchant"),
        categoryId = o.getString("categoryId"),
        cadence = o.getString("cadence"),
        amountCents = o.getLong("amountCents"),
        lastSeen = o.getString("lastSeen"),
        nextDue = o.getString("nextDue"),
        txnIds = ids,
        priceIncreaseCents = o.optLongOrNull("priceIncreaseCents"),
        muted = o.optBooleanOrNull("muted"),
    )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

data class Settings(
    val currency: String = "AUD",
    val locale: String = "en-AU",
    val paydayDayOfMonth: Int,
    /** Expected monthly take-home, integer cents. 0 = unknown. */
    val monthlyIncomeCents: Long,
    val savingsTargetCents: Long,
    /** Auto-lock delay in ms when backgrounded. Default 120000. */
    val lockTimeoutMs: Long,
    val biometricEnabled: Boolean,
    val pinnedCategoryIds: List<String> = emptyList(),
    val moveInDate: String? = null,
    val hasHecsDebt: Boolean? = null,
    val goalCurrentBalanceCents: Long? = null,
    val onboardingCompletedAt: Long? = null,
    val weeklyReviewMonth: String? = null,
    val weeklyReviewStep: String? = null,
)

fun Settings.toJson(): JsonValue.Obj = jsonObject {
    put("currency", currency)
    put("locale", locale)
    put("paydayDayOfMonth", paydayDayOfMonth)
    put("monthlyIncomeCents", monthlyIncomeCents)
    put("savingsTargetCents", savingsTargetCents)
    put("lockTimeoutMs", lockTimeoutMs)
    put("biometricEnabled", biometricEnabled)
    putArray("pinnedCategoryIds", pinnedCategoryIds)
    moveInDate?.let { put("moveInDate", it) }
    hasHecsDebt?.let { put("hasHecsDebt", it) }
    goalCurrentBalanceCents?.let { put("goalCurrentBalanceCents", it) }
    onboardingCompletedAt?.let { put("onboardingCompletedAt", it) }
    if (weeklyReviewMonth != null && weeklyReviewStep != null) {
        put(
            "weeklyReview",
            jsonObject {
                put("month", weeklyReviewMonth)
                put("step", weeklyReviewStep)
            },
        )
    }
}

fun settingsFromJson(o: JsonValue.Obj): Settings {
    val pinned = o.optArray("pinnedCategoryIds")?.map { (it as JsonValue.Str).value } ?: emptyList()
    val weeklyReview = o.optObject("weeklyReview")
    return Settings(
        currency = o.optString("currency", "AUD"),
        locale = o.optString("locale", "en-AU"),
        paydayDayOfMonth = o.getInt("paydayDayOfMonth"),
        monthlyIncomeCents = o.getLong("monthlyIncomeCents"),
        savingsTargetCents = o.getLong("savingsTargetCents"),
        lockTimeoutMs = o.getLong("lockTimeoutMs"),
        biometricEnabled = o.optBoolean("biometricEnabled", false),
        pinnedCategoryIds = pinned,
        moveInDate = o.optStringOrNull("moveInDate"),
        hasHecsDebt = o.optBooleanOrNull("hasHecsDebt"),
        goalCurrentBalanceCents = o.optLongOrNull("goalCurrentBalanceCents"),
        onboardingCompletedAt = o.optLongOrNull("onboardingCompletedAt"),
        weeklyReviewMonth = weeklyReview?.optStringOrNull("month"),
        weeklyReviewStep = weeklyReview?.optStringOrNull("step"),
    )
}

/** Default settings for a brand-new vault — mirrors useStore.ts's DEFAULT_SETTINGS shape (currency/locale/lock timeout). */
val DEFAULT_SETTINGS = Settings(
    currency = "AUD",
    locale = "en-AU",
    paydayDayOfMonth = 15,
    monthlyIncomeCents = 0L,
    savingsTargetCents = 0L,
    lockTimeoutMs = 120_000L,
    biometricEnabled = false,
    pinnedCategoryIds = emptyList(),
)

// Debug/print safety net: Kotlin data classes auto-generate toString() that
// would include every field (dates, amounts, merchant text) — never let one
// of these land in a Log.d/println by accident. Callers must not rely on the
// default toString() of Txn/Category/etc. for anything user-facing or logged.
