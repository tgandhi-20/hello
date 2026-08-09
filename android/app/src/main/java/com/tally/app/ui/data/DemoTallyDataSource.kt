package com.tally.app.ui.data

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import com.tally.app.ui.model.Cents
import com.tally.app.ui.model.CategoryKind
import com.tally.app.ui.model.UiBillDueSoon
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiCategorySpend
import com.tally.app.ui.model.UiDepositPlan
import com.tally.app.ui.model.UiMonthMoney
import com.tally.app.ui.model.UiToSortOutItem
import com.tally.app.ui.model.UiTxn
import java.time.LocalDate
import java.time.YearMonth
import java.util.UUID

/**
 * Placeholder [TallyDataSource] backed by in-memory demo data — NOT the real
 * app. It exists so every screen under `com.tally.app.ui` compiles, runs and
 * demonstrates the intended data flow (quick-add writes visibly show up on
 * Home and in the transactions list) before the money/vault agents' modules
 * exist to wire in for real. The orchestrator should replace
 * `rememberDemoDataSource()` at the call site in `TallyApp` with a real
 * implementation of [TallyDataSource] — nothing else in `ui/**` should need
 * to change, since every screen depends only on the interface.
 *
 * The equation figures below (income $6,457 / bills $1,293 / savings $3,500
 * -> to spend $1,664) are DESIGN-V4.md §1's own worked example, chosen
 * deliberately so Home reproduces that exact illustration.
 */
private val DEMO_CATEGORIES: List<UiCategory> = listOf(
    UiCategory("groceries", "Groceries", 1, CategoryKind.NEED, typicalAmountCents = 6_500),
    UiCategory("eating-out", "Eating out", 2, CategoryKind.WANT, typicalAmountCents = 3_200),
    UiCategory("lunch", "Lunch", 3, CategoryKind.WANT, typicalAmountCents = 1_400),
    UiCategory("coffee", "Coffee", 4, CategoryKind.WANT, typicalAmountCents = 550),
    UiCategory("shopping", "Shopping", 5, CategoryKind.WANT, typicalAmountCents = 4_500),
    UiCategory("transport", "Transport", 6, CategoryKind.NEED, typicalAmountCents = 2_000),
    UiCategory("health", "Health", 7, CategoryKind.NEED, typicalAmountCents = 3_000),
    UiCategory("entertainment", "Entertainment", 8, CategoryKind.WANT, typicalAmountCents = 2_500),
    UiCategory("subscriptions", "Subscriptions", 9, CategoryKind.NEED, typicalAmountCents = 1_500),
    UiCategory("utilities", "Utilities", 10, CategoryKind.NEED, typicalAmountCents = 8_000),
    UiCategory("gifts", "Gifts", 11, CategoryKind.WANT, typicalAmountCents = 5_000),
    UiCategory("other", "Other", 0, CategoryKind.WANT, typicalAmountCents = null),
)

/** Never lets a seeded date fall outside the current month, even when `today`
 *  is early in the month (e.g. the 3rd minus 9 days would otherwise land in
 *  the previous month). */
private fun demoDate(today: LocalDate, offsetDays: Long): LocalDate {
    val firstOfMonth = today.withDayOfMonth(1)
    val candidate = today.minusDays(offsetDays)
    return if (candidate.isBefore(firstOfMonth)) firstOfMonth else candidate
}

private fun seedTransactions(today: LocalDate): List<UiTxn> {
    // (categoryId, amountCents, dayOffset) — sums to 86,400c ($864.00), the
    // "already spent" figure in DESIGN-V4.md §1's worked example.
    val seed = listOf(
        Triple("groceries", 6_500L, 1L),
        Triple("groceries", 6_500L, 6L),
        Triple("eating-out", 3_200L, 0L),
        Triple("eating-out", 3_200L, 3L),
        Triple("eating-out", 3_200L, 8L),
        Triple("lunch", 1_400L, 0L),
        Triple("lunch", 1_400L, 2L),
        Triple("lunch", 1_400L, 4L),
        Triple("lunch", 1_400L, 7L),
        Triple("coffee", 550L, 0L),
        Triple("coffee", 550L, 1L),
        Triple("coffee", 550L, 2L),
        Triple("coffee", 550L, 3L),
        Triple("coffee", 550L, 4L),
        Triple("coffee", 550L, 5L),
        Triple("coffee", 550L, 6L),
        Triple("coffee", 550L, 7L),
        Triple("coffee", 550L, 9L),
        Triple("shopping", 4_500L, 2L),
        Triple("shopping", 4_500L, 9L),
        Triple("transport", 2_000L, 1L),
        Triple("transport", 2_000L, 4L),
        Triple("transport", 2_000L, 8L),
        Triple("health", 3_000L, 5L),
        Triple("entertainment", 2_500L, 6L),
        Triple("gifts", 5_000L, 3L),
        Triple("other", 27_750L, 2L),
    )
    return seed.mapIndexed { index, (categoryId, amountCents, offset) ->
        val label = DEMO_CATEGORIES.first { it.id == categoryId }.label
        UiTxn(
            id = "demo-$index",
            date = demoDate(today, offset),
            amountCents = amountCents,
            merchant = label,
            categoryId = categoryId,
        )
    }
}

private fun seedBillsDueSoon(today: LocalDate): List<UiBillDueSoon> = listOf(
    UiBillDueSoon(
        id = "bill-salary",
        date = today.plusDays(6),
        label = "Salary",
        amountCents = -645_700L,
        predicted = false,
    ),
    UiBillDueSoon(
        id = "bill-rent",
        date = today.plusDays(4),
        label = "Rent",
        amountCents = 90_000L,
        predicted = false,
    ),
    UiBillDueSoon(
        id = "bill-card",
        date = today.plusDays(11),
        label = "Card payment due",
        amountCents = 45_000L,
        predicted = true,
    ),
)

class DemoTallyDataSource : TallyDataSource {
    private val today: LocalDate = LocalDate.now()

    private val settingsIncomeCents = 645_700L
    private val settingsBillsCents = 129_300L
    private val settingsSavingsCents = 350_000L

    private val _transactions = mutableStateListOf<UiTxn>().apply { addAll(seedTransactions(today)) }

    override val lockState: State<VaultLockState> = mutableStateOf(VaultLockState.UNLOCKED)

    override val categories: State<List<UiCategory>> = mutableStateOf(DEMO_CATEGORIES)

    override val transactions: State<List<UiTxn>> = derivedStateOf {
        _transactions.sortedByDescending { it.date }
    }

    override val monthMoney: State<UiMonthMoney> = derivedStateOf {
        val month = YearMonth.from(today)
        val monthTxns = _transactions.filter { YearMonth.from(it.date) == month && it.amountCents > 0 }
        val spentCents = monthTxns.sumOf { it.amountCents }
        val toSpendCents = settingsIncomeCents - settingsBillsCents - settingsSavingsCents
        val leftCents = toSpendCents - spentCents
        val daysInMonth = month.lengthOfMonth()
        val daysRemaining = (daysInMonth - today.dayOfMonth + 1).coerceAtLeast(1)
        val leftTodayCents = Math.round(leftCents.toDouble() / daysRemaining)

        val byCategory: List<UiCategorySpend> = monthTxns
            .groupBy { it.categoryId }
            .map { (categoryId, txns) ->
                val category = DEMO_CATEGORIES.find { it.id == categoryId }
                UiCategorySpend(
                    categoryId = categoryId,
                    label = category?.label ?: categoryId,
                    colorIndex = category?.colorIndex ?: 0,
                    spentCents = txns.sumOf { it.amountCents },
                )
            }
            .sortedByDescending { it.spentCents }

        UiMonthMoney(
            incomeUnset = settingsIncomeCents <= 0,
            incomeCents = settingsIncomeCents,
            billsCents = settingsBillsCents,
            savingsCents = settingsSavingsCents,
            toSpendCents = toSpendCents,
            spentCents = spentCents,
            leftCents = leftCents,
            daysRemaining = daysRemaining,
            leftTodayCents = leftTodayCents,
            byCategory = byCategory,
        )
    }

    override val billsDueSoon: State<List<UiBillDueSoon>> = mutableStateOf(seedBillsDueSoon(today))

    override val depositPlan: State<UiDepositPlan> = mutableStateOf(
        UiDepositPlan(
            actualBalanceCents = 4_200_000L,
            goalTargetCents = 7_233_900L,
            onTrack = true,
            behindCents = 0L,
            daysLeft = 449,
        )
    )

    // Empty by design — demonstrates DESIGN-V4.md §1/§3's "renders nothing when
    // there is nothing to say" rule for a genuinely clean demo vault.
    override val toSortOut: State<List<UiToSortOutItem>> = mutableStateOf(emptyList())

    override fun addTransaction(categoryId: String, amountCents: Cents, note: String?): UiTxn {
        val category = DEMO_CATEGORIES.find { it.id == categoryId }
        val txn = UiTxn(
            id = UUID.randomUUID().toString(),
            date = LocalDate.now(),
            amountCents = amountCents,
            merchant = category?.label ?: categoryId,
            categoryId = categoryId,
            note = note,
        )
        _transactions.add(0, txn)
        return txn
    }

    override fun deleteTransaction(id: String) {
        _transactions.removeAll { it.id == id }
    }
}

@Composable
fun rememberDemoDataSource(): TallyDataSource = remember { DemoTallyDataSource() }
