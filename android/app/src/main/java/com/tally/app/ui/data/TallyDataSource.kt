package com.tally.app.ui.data

import androidx.compose.runtime.State
import com.tally.app.ui.model.Cents
import com.tally.app.ui.model.UiBillDueSoon
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiDepositPlan
import com.tally.app.ui.model.UiMonthMoney
import com.tally.app.ui.model.UiToSortOutItem
import com.tally.app.ui.model.UiTxn

/** Mirrors `src/types.ts`'s `LockState`, narrowed to what the UI branches on:
 *  whether the vault is currently readable. */
enum class VaultLockState { LOCKED, UNLOCKED }

/**
 * THE SEAM — everything this UI layer needs from the two packages it is not
 * allowed to touch: `com.tally.app.money` (the one money model,
 * DESIGN-V4.md §1) and `com.tally.app.security`/`com.tally.app.data` (the
 * vault: lock state + the transaction store).
 *
 * This file is owned by the UI agent and is intentionally narrow — it is
 * the contract the orchestrator reconciles against the real modules, not a
 * copy of their internals. Until that wiring happens, `DemoTallyDataSource`
 * (this package) implements it with in-memory fake data so every screen in
 * `com.tally.app.ui` compiles and runs standalone.
 *
 * AS OF THIS WRITING both real modules already exist in the tree (read-only
 * for this agent, per the task brief — inspected but never imported here):
 *  - `com.tally.app.money.MonthMoney` (`money/MonthMoney.kt`) already has the
 *    exact shape this file mirrors — `incomeUnset/incomeCents/billsCents/
 *    savingsCents/toSpendCents/spentCents/leftCents/daysRemaining/
 *    leftTodayCents/byCategory`, plus `foodThisWeek`/`savingsProgress` this
 *    UI layer doesn't need yet. `computeMonthMoney` there also already takes
 *    `java.time.LocalDate`/`YearMonth` and `Cents = Long` — SAME choices made
 *    independently here, so no type translation is needed on those.
 *  - ONE mismatch to reconcile: `MonthMoneyCategoryRow.colorToken` is a
 *    `String` token (`"cat-3"`); this file's `UiCategorySpend.colorIndex` is
 *    an `Int` (0-based, into `TallyColors.CategoryRamp`). The adapter should
 *    parse the trailing digits of `colorToken` and subtract 1
 *    (`"cat-3" -> 2`), falling back to a stable hash of the token (or 0) for
 *    anything that isn't `cat-<n>` (e.g. `"ink-3"` for an unknown category,
 *    per that field's own doc comment on the web/Kotlin side).
 *  - `com.tally.app.data.VaultRepository` (`data/VaultRepository.kt`) is a
 *    suspend-function CRUD surface (`isUnlocked(): Boolean`, plus add/get/
 *    delete-style suspend calls per store), not a Compose `State`-shaped
 *    object — there is no existing adapter from it to something this
 *    interface's `State<T>` properties can read directly. The orchestrator
 *    will need a thin ViewModel/state-holder in `ui/data/` (a new file,
 *    still inside this agent's owned tree) that: collects `VaultRepository`
 *    reads into `mutableStateOf`/`mutableStateListOf` on launch and after
 *    every write, calls `computeMonthMoney`-equivalent whenever the
 *    underlying transactions/settings change, and implements
 *    `addTransaction`/`deleteTransaction` by calling into
 *    `VaultRepository`'s suspend functions from a `rememberCoroutineScope()`
 *    launch. That adapter is the only new code needed — no screen in this
 *    package should have to change.
 *
 * Expected real wiring, screen by screen:
 *  - `monthMoney`      <- one call to `com.tally.app.money`'s
 *                         `computeMonthMoney`-equivalent, never recomputed
 *                         independently per screen.
 *  - `billsDueSoon`    <- the Kotlin equivalent of `buildBillsDueSoon()`
 *                         (`src/features/today/billsDueSoon.ts`) — not yet
 *                         found under `com.tally.app.money` as of this
 *                         writing; may still need porting.
 *  - `depositPlan`     <- `monthMoney`'s own `savingsProgress` — same number
 *                         as the equation's Savings line, never a second one.
 *  - `toSortOut`       <- the Kotlin equivalent of `buildToSortOut()`
 *                         (`src/features/today/toSortOut.ts`); also not yet
 *                         found under `com.tally.app.money`. Empty list =
 *                         render nothing (DESIGN-V4.md §1/§3).
 *  - `categories`      <- the vault's category table (`VaultRepository`).
 *  - `transactions`    <- the vault's transaction list, newest-first.
 *  - `lockState`       <- `VaultRepository.isUnlocked()`.
 *  - `addTransaction`/`deleteTransaction` <- vault writes; quick-add's Undo
 *                         action calls `deleteTransaction` on the just-added
 *                         id, exactly like the web app's toast action.
 *
 * All money in and out of this interface is `Long` cents — the UI never
 * computes a financial figure, only formats one (see `ui/model/Money.kt`).
 */
interface TallyDataSource {
    val lockState: State<VaultLockState>
    val categories: State<List<UiCategory>>
    val monthMoney: State<UiMonthMoney>
    val billsDueSoon: State<List<UiBillDueSoon>>
    val depositPlan: State<UiDepositPlan>
    val toSortOut: State<List<UiToSortOutItem>>
    /** Newest-first, matching the store contract the web app documents. */
    val transactions: State<List<UiTxn>>

    /** Records one quick-add entry and returns it (so the caller can offer Undo). */
    fun addTransaction(categoryId: String, amountCents: Cents, note: String?): UiTxn

    fun deleteTransaction(id: String)
}
