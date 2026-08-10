package com.tally.app.data

import com.tally.app.categorize.Rule
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind
import com.tally.app.money.RecurringCadence
import com.tally.app.money.RecurringSeries
import com.tally.app.money.Settings
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.util.JsonParseException
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
import java.time.LocalDate

/**
 * Tally — JSON (de)serialisation for the vault's persisted stores.
 *
 * The domain model itself lives ONE place only: `com.tally.app.money`
 * (Types.kt) — strongly typed (`LocalDate`, `AccountId`, `TxnSource`,
 * `CategoryKind`, integer `Cents`). This file does not declare its own
 * `Category`/`Txn`/`RecurringSeries`/`Settings` — it converts those money
 * types to and from the wire JSON a `.tally` backup (and this device's own
 * encrypted local storage — see VaultRepository's encrypt/decrypt boundary)
 * actually contains.
 *
 * FIELD NAMES AND VALUE ENCODINGS MATCH `src/types.ts` EXACTLY, BYTE FOR
 * BYTE, because a `.tally` backup produced by the web app has to import here
 * with zero conversion step:
 *  - `date`/`lastSeen`/`nextDue`/`moveInDate` are `LocalDate.toString()` /
 *    `LocalDate.parse(...)` — ISO `YYYY-MM-DD`, exactly what the web app's
 *    plain `DateStr` string already looks like.
 *  - `account` is `AccountId.id` ("cba" | "cba-card" | "bankwest" | "amex" |
 *    "cash"), parsed with `AccountId.fromId(...)`.
 *  - `source` is `"manual"` | `"csv"` (lowercase — matches
 *    `TxnSource.name.lowercase()`; verified against what the web app
 *    actually writes: `src/features/log/QuickAdd.tsx` writes
 *    `source: 'manual'` and `src/import/parse.ts` writes `source: 'csv'`).
 *  - `kind`/`cadence` are likewise the lowercase string form of their enum.
 *  - `excluded` is written only when `true` (omitted when `false`) and reads
 *    back as `false` when absent — matches the original Android encoding and
 *    the field's `boolean` (never corrupts on a strict absent/false read).
 *
 * MONEY IS `Long` CENTS, EVERYWHERE. Never Double, Float, or BigDecimal —
 * see JsonValue.Num.asLong() in util/Json.kt for why integer literals are
 * parsed straight from their digits rather than via Double, so a value
 * beyond 2^53 never loses precision.
 *
 * RESILIENT-DECRYPT CONTRACT: every `*FromJson` below is intentionally
 * strict — a missing/mistyped field, an unrecognised `account`/`source`/
 * `kind`/`cadence` string, or an unparseable date THROWS rather than
 * silently substituting a default. `VaultRepository.hydrateAll`'s
 * `decryptAll`/`decryptBatch` catches that per-record and counts it in
 * `skippedRecordCount` rather than corrupting the ledger with a guessed
 * value or failing the whole unlock.
 */

// ---------------------------------------------------------------------------
// Enum <-> wire-string helpers
// ---------------------------------------------------------------------------

private fun accountIdFromJson(id: String): AccountId =
    AccountId.fromId(id) ?: throw JsonParseException("Unknown account id '$id'")

private fun txnSourceToJson(source: TxnSource): String = source.name.lowercase()

private fun txnSourceFromJson(value: String): TxnSource = when (value) {
    "manual" -> TxnSource.MANUAL
    "csv" -> TxnSource.CSV
    else -> throw JsonParseException("Unknown txn source '$value'")
}

private fun categoryKindToJson(kind: CategoryKind): String = kind.name.lowercase()

private fun categoryKindFromJson(value: String): CategoryKind = when (value) {
    "need" -> CategoryKind.NEED
    "want" -> CategoryKind.WANT
    "save" -> CategoryKind.SAVE
    else -> throw JsonParseException("Unknown category kind '$value'")
}

private fun recurringCadenceFromJson(value: String): RecurringCadence =
    RecurringCadence.fromId(value) ?: throw JsonParseException("Unknown recurring cadence '$value'")

private fun localDateFromJson(value: String): LocalDate = LocalDate.parse(value)

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

fun Category.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("label", label)
    put("icon", icon)
    put("colorToken", colorToken)
    put("kind", categoryKindToJson(kind))
    put("builtin", builtin)
    put("order", order)
}

fun categoryFromJson(o: JsonValue.Obj): Category = Category(
    id = o.getString("id"),
    label = o.getString("label"),
    icon = o.getString("icon"),
    colorToken = o.getString("colorToken"),
    kind = categoryKindFromJson(o.getString("kind")),
    builtin = o.getBoolean("builtin"),
    order = o.getInt("order"),
)

// ---------------------------------------------------------------------------
// Txn
// ---------------------------------------------------------------------------

fun Txn.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("date", date.toString())
    put("amountCents", amountCents)
    put("description", description)
    put("merchant", merchant)
    put("categoryId", categoryId)
    put("account", account.id)
    put("source", txnSourceToJson(source))
    put("hash", hash)
    note?.let { put("note", it) }
    if (excluded) put("excluded", true) // omitted when false, matches the web app's optional field
    recurringId?.let { put("recurringId", it) }
    put("createdAt", createdAt)
    put("updatedAt", updatedAt)
}

fun txnFromJson(o: JsonValue.Obj): Txn = Txn(
    id = o.getString("id"),
    date = localDateFromJson(o.getString("date")),
    amountCents = o.getLong("amountCents"),
    description = o.getString("description"),
    merchant = o.getString("merchant"),
    categoryId = o.getString("categoryId"),
    account = accountIdFromJson(o.getString("account")),
    source = txnSourceFromJson(o.getString("source")),
    hash = o.getString("hash"),
    note = o.optStringOrNull("note"),
    excluded = o.optBoolean("excluded", false),
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

fun RecurringSeries.toJson(): JsonValue.Obj = jsonObject {
    put("id", id)
    put("merchant", merchant)
    put("categoryId", categoryId)
    put("cadence", cadence.id)
    put("amountCents", amountCents)
    put("lastSeen", lastSeen.toString())
    put("nextDue", nextDue.toString())
    putArray("txnIds", txnIds)
    priceIncreaseCents?.let { put("priceIncreaseCents", it) }
    put("muted", muted)
    // `confirmed` is deliberately NOT serialised: it has no counterpart in
    // src/types.ts's RecurringSeries (Android-only, see MonthMoney.kt's
    // isBillSeries doc comment) — writing it would break wire compatibility
    // with the web app's `.tally` format.
}

fun recurringFromJson(o: JsonValue.Obj): RecurringSeries {
    val ids = o.optArray("txnIds")?.map { (it as JsonValue.Str).value } ?: emptyList()
    return RecurringSeries(
        id = o.getString("id"),
        merchant = o.getString("merchant"),
        categoryId = o.getString("categoryId"),
        cadence = recurringCadenceFromJson(o.getString("cadence")),
        amountCents = o.getLong("amountCents"),
        lastSeen = localDateFromJson(o.getString("lastSeen")),
        nextDue = localDateFromJson(o.getString("nextDue")),
        txnIds = ids,
        priceIncreaseCents = o.optLongOrNull("priceIncreaseCents"),
        muted = o.optBoolean("muted", false),
        // confirmed defaults to false — see the toJson doc comment above.
    )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

fun Settings.toJson(): JsonValue.Obj = jsonObject {
    put("currency", currency)
    put("locale", locale)
    put("paydayDayOfMonth", paydayDayOfMonth)
    put("monthlyIncomeCents", monthlyIncomeCents)
    put("savingsTargetCents", savingsTargetCents)
    put("lockTimeoutMs", lockTimeoutMs)
    put("biometricEnabled", biometricEnabled)
    putArray("pinnedCategoryIds", pinnedCategoryIds)
    moveInDate?.let { put("moveInDate", it.toString()) }
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
        moveInDate = o.optStringOrNull("moveInDate")?.let { localDateFromJson(it) },
        hasHecsDebt = o.optBooleanOrNull("hasHecsDebt"),
        goalCurrentBalanceCents = o.optLongOrNull("goalCurrentBalanceCents"),
        onboardingCompletedAt = o.optLongOrNull("onboardingCompletedAt"),
        weeklyReviewMonth = weeklyReview?.optStringOrNull("month"),
        weeklyReviewStep = weeklyReview?.optStringOrNull("step"),
    )
}

/** The settings table always holds exactly one row, under this fixed id — shared by VaultRepository and Rekey. */
const val SETTINGS_ROW_ID = "settings"

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
