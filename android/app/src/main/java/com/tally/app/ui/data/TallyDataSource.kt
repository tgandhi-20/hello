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
 * copy of their internals. `DemoTallyDataSource` (this package) implements
 * it with in-memory fake data so every screen in `com.tally.app.ui`
 * compiles and runs standalone; `VaultTallyDataSource` (this package) is
 * the real, vault-backed implementation.
 *
 * Real wiring, screen by screen (all satisfied by `VaultTallyDataSource`):
 *  - `monthMoney`      <- ONE call to `com.tally.app.money.computeMonthMoney`
 *                         per hydrate/mutation, never recomputed
 *                         independently per screen.
 *  - `billsDueSoon`    <- `com.tally.app.money.buildBillsDueSoon`, mapped to
 *                         `UiBillDueSoon`. Computed from the SAME cached
 *                         `txns`/`recurring`/`settings` and the SAME `today`
 *                         value as `monthMoney`, in the same recompute pass
 *                         — see `VaultTallyDataSource.recomputeMoney`.
 *  - `depositPlan`     <- `monthMoney`'s own `savingsProgress` — same number
 *                         as the equation's Savings line, never a second one.
 *  - `toSortOut`       <- `com.tally.app.money.buildToSortOut`, mapped to
 *                         `UiToSortOutItem`, from the same recompute pass.
 *                         `resolvedRoutineItems` is always passed as an empty
 *                         list — the `routine` feature (checklist
 *                         resolution) has no Android port yet, so this can
 *                         only ever surface the `uncategorised` and
 *                         `price-rise` kinds `buildToSortOut` also computes.
 *                         Empty list = render nothing (DESIGN-V4.md §1/§3).
 *  - `categories`      <- the vault's category table (`VaultRepository`).
 *  - `transactions`    <- the vault's transaction list, newest-first.
 *  - `lockState`       <- `VaultRepository.isUnlocked()`.
 *  - `skippedRecordCount` <- `VaultRepository.hydrateAll()`'s own count of
 *                         records that failed to decrypt this hydrate
 *                         (ANDROID-NATIVE.md §3.6) — surfaced honestly so a
 *                         partial ledger is never presented as a complete
 *                         one. 0 until the first hydrate.
 *  - `addTransaction`/`deleteTransaction` <- vault writes, off the main
 *                         thread (both `suspend`; see
 *                         `VaultTallyDataSource`'s own doc comment for why).
 *                         Quick-add's Undo action calls `deleteTransaction`
 *                         on the just-added id, exactly like the web app's
 *                         toast action.
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

    /** Records this hydrate's `VaultRepository.hydrateAll()`
     *  `skippedRecordCount` — records that could not be decrypted and were
     *  therefore left out of every figure above. 0 means nothing was
     *  skipped; it does NOT mean the vault is empty. */
    val skippedRecordCount: State<Int>

    /** Records one quick-add entry and returns it (so the caller can offer
     *  Undo by id). `suspend` so the write can go through the vault's
     *  encrypt-then-persist path without blocking the calling thread —
     *  call from a `CoroutineScope` (`rememberCoroutineScope()` in Compose). */
    suspend fun addTransaction(categoryId: String, amountCents: Cents, note: String?): UiTxn

    suspend fun deleteTransaction(id: String)
}
