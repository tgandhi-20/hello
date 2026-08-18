package com.tally.app.ui.data

import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateOf
import com.tally.app.data.VaultRepository
import com.tally.app.money.AccountBalance
import com.tally.app.money.AccountId
import com.tally.app.money.BillDueSoonCertainty
import com.tally.app.money.BillDueSoonItem
import com.tally.app.money.Category
import com.tally.app.money.CategoryKind as MoneyCategoryKind
import com.tally.app.money.ComputeMonthMoneyParams
import com.tally.app.money.MonthMoney
import com.tally.app.money.MonthMoneySavingsProgress
import com.tally.app.money.MonthMoneyCategoryRow
import com.tally.app.money.RecurringSeries
import com.tally.app.money.Settings
import com.tally.app.money.ToSortOutItem
import com.tally.app.money.Txn
import com.tally.app.money.TxnSource
import com.tally.app.money.buildAccountBalances
import com.tally.app.money.buildBillsDueSoon
import com.tally.app.money.buildToSortOut
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
import kotlinx.coroutines.withContext
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

/** [UiBillDueSoon] drops [BillDueSoonItem.kind] (the UI doesn't branch on it)
 *  and collapses [BillDueSoonItem.certainty] to the boolean the row actually
 *  renders — `PREDICTED` -> "we think, not confirmed yet". */
internal fun toUiBillDueSoon(item: BillDueSoonItem): UiBillDueSoon = UiBillDueSoon(
    id = item.id,
    date = item.date,
    label = item.label,
    amountCents = item.amountCents,
    predicted = item.certainty == BillDueSoonCertainty.PREDICTED,
)

/** [UiToSortOutItem] drops [ToSortOutItem.kind] and [ToSortOutItem.to] — this
 *  UI layer has no navigation-route field on its shape; `HomeScreen`'s
 *  `onOpenToSortOutItem(item)` callback gets the whole [UiToSortOutItem] and
 *  is expected to route off its `id` (`"uncategorised"`, `"price-rise-*"`,
 *  `"routine-*"`), matching [ToSortOutItem.id]'s own scheme. */
internal fun toUiToSortOutItem(item: ToSortOutItem): UiToSortOutItem = UiToSortOutItem(
    id = item.id,
    title = item.title,
    subtitle = item.subtitle,
    amountCents = item.amountCents,
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
 * `mutableStateOf` fields, and [recomputeMoney] derives `monthMoney`,
 * `billsDueSoon` and `toSortOut` from those SAME cached inputs and the SAME
 * `today` value in one pass every hydrate/mutation — never independently
 * recomputed per screen, never able to disagree (docs/AGENT-BRIEF.md §3).
 * Every write (`addTransaction`, `deleteTransaction`) updates the cached
 * transaction list in place and calls [recomputeMoney] again, rather than
 * re-decrypting the whole vault on every quick-add.
 *
 * OFF-MAIN-THREAD WRITES: [TallyDataSource.addTransaction]/`deleteTransaction`
 * are `suspend`. Each wraps its single [VaultRepository] call in
 * `withContext(Dispatchers.IO)` — the actual work (one AES-GCM encrypt plus
 * one Room insert/delete) runs on the IO dispatcher, and the `suspend` call
 * SUSPENDS the caller's coroutine rather than blocking its thread while
 * waiting. This replaces an earlier `runBlocking(Dispatchers.IO)` version,
 * which blocked the calling thread (in practice the Compose UI thread, since
 * quick-add called it from a plain click handler) for the same work — fine
 * at today's data sizes, but the wrong shape and an ANR risk on a slow write.
 * `addTransaction` still returns the REAL persisted [UiTxn] (with the id
 * [VaultRepository] assigned it), which quick-add's Undo snackbar deletes by
 * id — same contract as before, now reached via `await` instead of a block.
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
    private val _billsDueSoon = mutableStateOf<List<UiBillDueSoon>>(emptyList())
    private val _toSortOut = mutableStateOf<List<UiToSortOutItem>>(emptyList())
    private val _accounts = mutableStateOf<List<AccountBalance>>(emptyList())

    private val _skippedRecordCount = mutableStateOf(0)

    /** Records the last [VaultRepository.hydrateAll] could not decrypt — surfaced
     *  honestly, never silently dropped (docs/ANDROID-NATIVE.md §3.6). */
    override val skippedRecordCount: State<Int> = _skippedRecordCount

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

    override val billsDueSoon: State<List<UiBillDueSoon>> = _billsDueSoon
    override val toSortOut: State<List<UiToSortOutItem>> = _toSortOut
    override val accounts: State<List<AccountBalance>> = _accounts

    override val transactions: State<List<UiTxn>> = derivedStateOf {
        _txns.value.map(::toUiTxn).sortedByDescending { it.date }
    }

    // ---------------------------------------------------------------------
    // Domain-typed accessors for screens the Ui* model does not cover
    //
    // Goal and Recurring need fields the Ui* shapes do not carry:
    // MonthMoneySavingsProgress' full set (projected vs actual balance, and
    // crucially whether the "actual" is real or the projection standing in),
    // and the RecurringSeries objects themselves so a series can be confirmed
    // or muted.
    //
    // These read from the SAME `_computed`/`_recurring` state as everything
    // else, so exposing them cannot introduce a second source of truth — a
    // screen using these is still reading the one computeMonthMoney result.
    // Widening the Ui* model to mirror every domain field would have been the
    // alternative, and that is how you end up maintaining two parallel model
    // sets, which this project already had to collapse once.
    // ---------------------------------------------------------------------

    /** The goal figures, straight off the single computed result. Null before the first hydrate. */
    val savingsProgress: State<MonthMoneySavingsProgress?> = derivedStateOf {
        _computed.value?.savingsProgress
    }

    /** The detected recurring series, for the screen that confirms/mutes them. */
    val recurringSeries: State<List<RecurringSeries>> = _recurring

    /**
     * Confirm or mute a series. Writes the whole list back because that is the
     * shape `VaultRepository.setRecurring` takes, then re-hydrates so the
     * equation's Bills line reflects the change immediately — muting a series
     * changes what `isBillSeries` counts, so Home must not keep showing the
     * old total.
     */
    suspend fun updateRecurringSeries(updated: RecurringSeries) = withContext(Dispatchers.IO) {
        val next = _recurring.value.map { if (it.id == updated.id) updated else it }
        repository.setRecurring(next)
        _recurring.value = next
        recomputeMoney()
    }

    /**
     * Record the user's real deposit balance, or clear it (null) to fall back
     * to the projection. Kept as a nullable so "I have not told you" stays
     * distinguishable from "it is zero" — the Goal screen says which of those
     * it is showing, and it can only do that if the distinction survives here.
     */
    suspend fun setGoalActualBalance(cents: Long?) = withContext(Dispatchers.IO) {
        val next = repository.updateSettings { it.copy(goalCurrentBalanceCents = cents) }
        _settings.value = next
        recomputeMoney()
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
        _billsDueSoon.value = emptyList()
        _toSortOut.value = emptyList()
        _accounts.value = emptyList()
        _skippedRecordCount.value = 0
    }

    /**
     * The [ComputeMonthMoneyParams] for [month], built from whatever is
     * currently cached in `_txns`/`_recurring`/`_settings`/`_rawCategories`.
     * Factored out of [recomputeMoney] so [monthMoneyFor] can ask
     * [computeMonthMoney] the SAME question for a different month without
     * duplicating the params block — never a second derivation path
     * (docs/AGENT-BRIEF.md §3).
     */
    private fun paramsFor(month: YearMonth, today: LocalDate): ComputeMonthMoneyParams = ComputeMonthMoneyParams(
        txns = _txns.value,
        recurring = _recurring.value,
        settings = _settings.value,
        categories = _rawCategories.value,
        month = month,
        today = today,
    )

    /**
     * The single recompute pass every hydrate/mutation runs through.
     * `monthMoney`, `billsDueSoon` and `toSortOut` are ALL derived here, from
     * the same `_txns`/`_recurring`/`_settings` snapshot and the same
     * `today` — the "one hydrate, nothing can disagree" guarantee
     * docs/AGENT-BRIEF.md §3 requires.
     *
     * `resolvedRoutineItems` is always `emptyList()`: the `routine` feature
     * (monthly checklist resolution) has no Android port yet — see
     * `ToSortOut.kt`'s own doc comment. `buildToSortOut` still applies its
     * "vaultHasData" gate and returns the `uncategorised`/`price-rise` items
     * it can already compute without it.
     *
     * `accounts` is built here too, off the exact same `_txns.value` this
     * pass already reads for `computeMonthMoney` — one more view of the one
     * hydrated ledger, never a second vault scan (docs/AGENT-BRIEF.md §3).
     */
    private fun recomputeMoney() {
        val today = LocalDate.now()
        _computed.value = computeMonthMoney(paramsFor(YearMonth.from(today), today))
        _billsDueSoon.value = buildBillsDueSoon(
            txns = _txns.value,
            recurring = _recurring.value,
            settings = _settings.value,
            today = today,
        ).map(::toUiBillDueSoon)
        _toSortOut.value = buildToSortOut(
            txns = _txns.value,
            recurring = _recurring.value,
            resolvedRoutineItems = emptyList(),
            today = today,
        ).map(::toUiToSortOutItem)
        _accounts.value = buildAccountBalances(_txns.value)
    }

    /**
     * The spend tracker's prev/next month navigation — [computeMonthMoney]
     * run for an arbitrary [month] instead of the current one, through the
     * SAME [paramsFor] the current-month recompute pass uses, so this can
     * never disagree with `monthMoney` for the current month
     * (docs/AGENT-BRIEF.md §3: one money engine, never a second derivation
     * path). `suspend`/`Dispatchers.IO` because this walks the whole cached
     * ledger doing real arithmetic, same convention as this class's other
     * suspend members.
     */
    override suspend fun monthMoneyFor(month: YearMonth): UiMonthMoney = withContext(Dispatchers.IO) {
        toUiMonthMoney(computeMonthMoney(paramsFor(month, LocalDate.now())))
    }

    override suspend fun addTransaction(categoryId: String, amountCents: Long, note: String?): UiTxn {
        val label = _rawCategories.value.find { it.id == categoryId }?.label ?: categoryId
        val txn = withContext(Dispatchers.IO) {
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

    override suspend fun deleteTransaction(id: String) {
        withContext(Dispatchers.IO) { repository.deleteTxn(id) }
        _txns.value = _txns.value.filterNot { it.id == id }
        recomputeMoney()
    }
}
