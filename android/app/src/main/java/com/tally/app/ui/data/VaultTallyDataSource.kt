package com.tally.app.ui.data

import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateOf
import com.tally.app.data.VaultRepository
import com.tally.app.money.AccountId
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind as MoneyCategoryKind
import com.tally.app.money.ComputeMonthMoneyParams
import com.tally.app.money.MonthMoney
import com.tally.app.money.MonthMoneyCategoryRow
import com.tally.app.money.RecurringSeries
import com.tally.app.money.Settings
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.money.computeMonthMoney
import com.tally.app.ui.model.CategoryKind as UiCategoryKind
import com.tally.app.ui.model.UiBillDueSoon
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiCategorySpend
import com.tally.app.ui.model.UiDepositPlan
import com.tally.app.ui.model.UiMonthMoney
import com.tally.app.ui.model.UiToSortOutItem
import com.tally.app.ui.model.UiTxn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import java.time.LocalDate
import java.time.YearMonth

// ---------------------------------------------------------------------------
// Pure mapping helpers — no Android/Compose/VaultRepository dependency, so
// every one of these is directly JUnit-testable on the host JVM (see
// VaultTallyDataSourceMappingTest.kt).
// ---------------------------------------------------------------------------

private val CAT_TOKEN_REGEX = Regex("^cat-(\\d+)$")

/**
 * Maps a money-layer colour token (`"cat-3"`) to a 0-based
 * [UiCategory.colorIndex] / [UiCategorySpend.colorIndex] — `"cat-3" -> 2`.
 * Anything that isn't `cat-<n>` (notably `"ink-3"`, which `MonthMoney`
 * emits for a category that no longer resolves — see
 * [MonthMoneyCategoryRow.colorToken]'s own doc comment) falls back to a
 * stable, deterministic index derived from the token's own hash — never a
 * crash, never a value that changes between renders. The fallback is
 * intentionally NOT reduced into `0 until CategoryRamp.size` here — this
 * file must not depend on `ui/theme` to know that size, and
 * `TallyColors.categoryColor()` already wraps any index safely regardless
 * of magnitude.
 */
internal fun colorTokenToIndex(token: String): Int {
    val n = CAT_TOKEN_REGEX.find(token)?.groupValues?.get(1)?.toIntOrNull()
    if (n != null && n >= 1) return n - 1
    return token.hashCode() and 0x7fffffff
}

internal fun toUiCategorySpend(row: MonthMoneyCategoryRow): UiCategorySpend = UiCategorySpend(
    categoryId = row.categoryId,
    label = row.label,
    colorIndex = colorTokenToIndex(row.colorToken),
    spentCents = row.spentCents,
)

internal fun toUiMonthMoney(m: MonthMoney): UiMonthMoney = UiMonthMoney(
    incomeUnset = m.incomeUnset,
    incomeCents = m.incomeCents,
    billsCents = m.billsCents,
    savingsCents = m.savingsCents,
    toSpendCents = m.toSpendCents,
    spentCents = m.spentCents,
    leftCents = m.leftCents,
    daysRemaining = m.daysRemaining,
    leftTodayCents = m.leftTodayCents,
    byCategory = m.byCategory.map(::toUiCategorySpend),
)

/** [UiDepositPlan] is `monthMoney`'s own `savingsProgress` line — never a
 *  second, independently-computed figure (DESIGN-V4.md §1). `null` (not yet
 *  hydrated) renders as an honest all-zero plan rather than a crash. */
internal fun toUiDepositPlan(m: MonthMoney?): UiDepositPlan {
    val progress = m?.savingsProgress
    return UiDepositPlan(
        actualBalanceCents = progress?.actualBalanceCents ?: 0L,
        goalTargetCents = progress?.goalTargetCents ?: 0L,
        onTrack = progress?.onTrack ?: true,
        behindCents = progress?.behindCents ?: 0L,
        daysLeft = progress?.daysUntilTarget ?: 0,
    )
}

internal fun toUiCategoryKind(kind: MoneyCategoryKind): UiCategoryKind = when (kind) {
    MoneyCategoryKind.NEED -> UiCategoryKind.NEED
    MoneyCategoryKind.WANT -> UiCategoryKind.WANT
    MoneyCategoryKind.SAVE -> UiCategoryKind.SAVE
}

internal fun toUiCategory(c: Category): UiCategory = UiCategory(
    id = c.id,
    label = c.label,
    colorIndex = colorTokenToIndex(c.colorToken),
    kind = toUiCategoryKind(c.kind),
    builtin = c.builtin,
    // No historical-average/"suggested amount" engine exists under
    // com.tally.app.money yet — see UiCategory's own doc comment: "supplied
    // by the money/vault layer... null when there's no history yet, in
    // which case quick-add starts blank rather than guessing." Inventing
    // one here would also mean the UI computing a financial figure, which
    // it must never do. Always null until that engine exists.
    typicalAmountCents = null,
)

internal fun toUiTxn(t: Txn): UiTxn = UiTxn(
    id = t.id,
    date = t.date,
    amountCents = t.amountCents,
    merchant = t.merchant,
    categoryId = t.categoryId,
    note = t.note,
)

private val EMPTY_MONTH_MONEY = UiMonthMoney(
    incomeUnset = true,
    incomeCents = 0,
    billsCents = 0,
    savingsCents = 0,
    toSpendCents = 0,
    spentCents = 0,
    leftCents = 0,
    daysRemaining = 1,
    leftTodayCents = 0,
    byCategory = emptyList(),
)

/**
 * The real [TallyDataSource] — backed by [VaultRepository] (encrypted
 * storage + lock state) and [computeMonthMoney] (the one money engine, per
 * `MonthMoney.kt`'s own doc comment). See this package's `TallyDataSource`
 * doc comment for exactly what this class wires up.
 *
 * STATE STRATEGY: [VaultRepository] is suspend CRUD, not `State`-shaped.
 * This class hydrates every store once via [onUnlocked] (called after a
 * successful PIN/biometric unlock or fresh setup) into private
 * `mutableStateOf` fields, and [computeMonthMoney] is called exactly ONCE
 * per hydrate/mutation from those cached inputs — `monthMoney`,
 * `depositPlan` and `categories` are all `derivedStateOf` VIEWS of that one
 * result, never separately recomputed. Every write (`addTransaction`,
 * `deleteTransaction`) updates the cached transaction list in place and
 * recomputes from it, rather than re-decrypting the whole vault on every
 * quick-add.
 *
 * SYNCHRONOUS WRITES: [TallyDataSource.addTransaction]/`deleteTransaction`
 * are plain (non-suspend) calls — `addTransaction`'s return value is the
 * REAL persisted [UiTxn] with the id [VaultRepository] assigned it, which
 * quick-add's Undo snackbar deletes by id, so it cannot be a fire-and-forget
 * call. `runBlocking(Dispatchers.IO)` bridges that gap deliberately: the
 * underlying work is one AES-GCM encrypt plus one Room insert/delete —
 * milliseconds, not a network call — dispatched onto the IO thread pool
 * while the caller (a single Compose click handler, not a hot loop) blocks
 * only for that. This was chosen over reshaping the already-fixed
 * `TallyDataSource` interface to be `suspend`.
 */
class VaultTallyDataSource(private val repository: VaultRepository) : TallyDataSource {

    private val _lockState = mutableStateOf(
        if (repository.isUnlocked()) VaultLockState.UNLOCKED else VaultLockState.LOCKED,
    )
    override val lockState: State<VaultLockState> = _lockState

    private val _rawCategories = mutableStateOf<List<Category>>(emptyList())
    private val _txns = mutableStateOf<List<Txn>>(emptyList())
    private val _recurring = mutableStateOf<List<RecurringSeries>>(emptyList())
    private val _settings = mutableStateOf(Settings())
    private val _computed = mutableStateOf<MonthMoney?>(null)

    private val _skippedRecordCount = mutableStateOf(0)

    /** Records the last [VaultRepository.hydrateAll] could not decrypt — surfaced
     *  honestly, never silently dropped (docs/ANDROID-NATIVE.md §3.6). */
    val skippedRecordCount: State<Int> = _skippedRecordCount

    /** The vault's current auto-lock window, for the hosting Activity's
     *  lifecycle wiring — defaults to `Settings()`'s built-in 120s until the
     *  first hydrate actually reads the stored value. */
    val lockTimeoutMs: Long get() = _settings.value.lockTimeoutMs

    override val categories: State<List<UiCategory>> = derivedStateOf {
        _rawCategories.value.sortedBy { it.order }.map(::toUiCategory)
    }

    override val monthMoney: State<UiMonthMoney> = derivedStateOf {
        _computed.value?.let(::toUiMonthMoney) ?: EMPTY_MONTH_MONEY
    }

    override val depositPlan: State<UiDepositPlan> = derivedStateOf {
        toUiDepositPlan(_computed.value)
    }

    // Neither Kotlin port exists yet under com.tally.app.money as of this
    // writing (see TallyDataSource.kt's doc comment: `buildBillsDueSoon()`
    // and `buildToSortOut()`). An empty list renders nothing, which is
    // correct and honest per DESIGN-V4.md §1/§3 — never an invented item.
    override val billsDueSoon: State<List<UiBillDueSoon>> = mutableStateOf<List<UiBillDueSoon>>(emptyList())
    override val toSortOut: State<List<UiToSortOutItem>> = mutableStateOf<List<UiToSortOutItem>>(emptyList())

    override val transactions: State<List<UiTxn>> = derivedStateOf {
        _txns.value.map(::toUiTxn).sortedByDescending { it.date }
    }

    /** Call after a successful unlock (PIN, biometric, or fresh setup) —
     *  hydrates every store and flips [lockState] to UNLOCKED. */
    suspend fun onUnlocked() {
        val result = repository.hydrateAll()
        _txns.value = result.txns
        _rawCategories.value = result.categories
        _recurring.value = result.recurring
        _settings.value = result.settings
        _skippedRecordCount.value = result.skippedRecordCount
        recomputeMoney()
        _lockState.value = VaultLockState.UNLOCKED
    }

    /** Call whenever the vault is locked (explicit lock, auto-lock timeout,
     *  or a recreated/foregrounded Activity that finds itself still locked)
     *  — drops every cached decrypted figure from memory so nothing lingers
     *  behind the lock screen. */
    fun onLocked() {
        _lockState.value = VaultLockState.LOCKED
        _txns.value = emptyList()
        _rawCategories.value = emptyList()
        _recurring.value = emptyList()
        _settings.value = Settings()
        _computed.value = null
        _skippedRecordCount.value = 0
    }

    private fun recomputeMoney() {
        val today = LocalDate.now()
        _computed.value = computeMonthMoney(
            ComputeMonthMoneyParams(
                txns = _txns.value,
                recurring = _recurring.value,
                settings = _settings.value,
                categories = _rawCategories.value,
                month = YearMonth.from(today),
                today = today,
            ),
        )
    }

    override fun addTransaction(categoryId: String, amountCents: Long, note: String?): UiTxn {
        val label = _rawCategories.value.find { it.id == categoryId }?.label ?: categoryId
        val txn = runBlocking(Dispatchers.IO) {
            repository.addTxn(
                date = LocalDate.now(),
                amountCents = amountCents,
                description = label,
                merchant = label,
                categoryId = categoryId,
                // Quick-add has no bank account to attach to — CASH is the
                // account family for a manually-logged entry (see
                // AccountId's own doc comment).
                account = AccountId.CASH,
                source = TxnSource.MANUAL,
                note = note,
            )
        }
        _txns.value = _txns.value + txn
        recomputeMoney()
        return toUiTxn(txn)
    }

    override fun deleteTransaction(id: String) {
        runBlocking(Dispatchers.IO) { repository.deleteTxn(id) }
        _txns.value = _txns.value.filterNot { it.id == id }
        recomputeMoney()
    }
}
