package com.tally.app.ui.settings

import com.tally.app.data.VaultRepository
import com.tally.app.security.isValidPin

/**
 * Changing the PIN, done safely.
 *
 * [VaultRepository] has no dedicated "rekey" primitive -- `setupPin` alone
 * regenerates the salt/verifier and switches the active key, but every
 * financial record already on disk stays encrypted under the OLD key, so
 * calling it on an already-set-up vault would make every transaction,
 * category, budget, rule and recurring series permanently undecryptable.
 * That is not "locking the user out of one record" (docs/ANDROID-NATIVE.md
 * §3.6's tolerated failure mode) -- it is silently discarding the entire
 * vault, which is exactly the class of bug §3.7 ("validate before
 * destroying") exists to prevent.
 *
 * [changePin] instead composes the SAFE public operations
 * [VaultRepository] already exposes, each of which preserves the id of
 * whatever it re-writes (see the loop below), so nothing referencing that id
 * elsewhere (a transaction's `recurringId`, a recurring series' `txnIds`, a
 * budget's `categoryId`) silently breaks:
 *
 *  1. [VaultRepository.unlock] with the CURRENT pin -- proves the caller
 *     actually knows it before anything is touched.
 *  2. [VaultRepository.hydrateAll] -- decrypts everything under the OLD key,
 *     entirely in memory.
 *  3. [VaultRepository.setupPin] with the NEW pin -- the one genuinely
 *     destructive step: from this instant the OLD pin no longer unlocks
 *     anything, and every already-stored record is unreadable until step 4
 *     re-writes it.
 *  4. Every record captured in step 2 is written straight back through
 *     [VaultRepository]'s normal per-store write calls, which now run under
 *     the NEW key -- `updateTxn`/`addCategory`/`setBudget` all preserve the
 *     id they are given; `setRecurring` replaces the whole table using each
 *     series' own embedded id. `addRule` is the one exception: the public
 *     API has no way to write a rule under a chosen id, so re-created rules
 *     get freshly-minted ones. That is harmless -- nothing else references a
 *     [com.tally.app.data.Rule] by id; categorisation matches on
 *     content (`match`/`categoryId`), never identity -- but it is a real,
 *     deliberate divergence, flagged here rather than left implicit.
 *
 * RESIDUAL RISK, stated plainly rather than hidden: step 3 cannot be undone
 * with what [VaultRepository] currently exposes -- there is no way to read
 * back the OLD salt/verifier once step 3 has run. If step 4 is interrupted
 * partway (the process is killed, the device loses power) after step 3 has
 * already committed, the vault is left readable under the NEW pin but with
 * only some records re-written -- functionally identical to a partial
 * `resetAll`. The only recovery at that point is restoring a `.tally`
 * backup. This is exactly why the Settings screen that calls this function
 * shows a "back up first" note before offering Change PIN, and why a proper
 * fix belongs as an atomic primitive in `VaultRepository` itself (the
 * `data/` module, not this one) rather than as a UI-layer workaround -- see
 * the top-level task report for this flagged explicitly.
 */
sealed class ChangePinResult {
    object Ok : ChangePinResult()
    object WrongCurrentPin : ChangePinResult()
    data class InvalidNewPin(val reason: String) : ChangePinResult()
    data class LockedOut(val remainingMs: Long) : ChangePinResult()
    data class Failed(val reason: String) : ChangePinResult()
}

suspend fun changePin(repository: VaultRepository, currentPin: String, newPin: String): ChangePinResult {
    if (!isValidPin(newPin)) {
        return ChangePinResult.InvalidNewPin("A PIN must be 4 to 10 digits.")
    }

    when (val verified = repository.unlock(currentPin)) {
        is VaultRepository.UnlockResult.Ok -> Unit
        is VaultRepository.UnlockResult.WrongSecret -> return ChangePinResult.WrongCurrentPin
        is VaultRepository.UnlockResult.LockedOut -> return ChangePinResult.LockedOut(verified.remainingMs)
        is VaultRepository.UnlockResult.NotSetUp -> return ChangePinResult.Failed("Tally isn't set up on this device yet.")
        is VaultRepository.UnlockResult.BiometricUnavailable ->
            return ChangePinResult.Failed("Couldn't verify the current PIN. Try again.")
    }

    // Everything below runs under the OLD key -- captured in memory before
    // step 3 (setupPin) makes it unreadable.
    val before = repository.hydrateAll()

    // The one irreversible step -- see this file's class doc comment.
    repository.setupPin(newPin)

    return try {
        for (txn in before.txns) {
            repository.updateTxn(txn) { it }
        }
        for (category in before.categories) {
            repository.addCategory(category)
        }
        for ((id, budget) in before.budgets) {
            repository.setBudget(id, budget)
        }
        for (rule in before.rules) {
            repository.addRule(rule.match, rule.categoryId)
        }
        repository.setRecurring(before.recurring)
        repository.updateSettings { before.settings }
        // The biometric-wrapped key blob still holds the OLD key's raw
        // bytes, which will never satisfy the NEW verifier setupPin just
        // wrote -- same reasoning importBackup's own doc comment gives for
        // always disabling biometric on restore. Left configured, it would
        // look enabled but silently fail every attempt until the user
        // re-enrolled it by hand; disabling it here means the Settings
        // screen can prompt them to turn it back on instead.
        repository.disableBiometric()
        ChangePinResult.Ok
    } catch (e: Exception) {
        ChangePinResult.Failed(
            "Your PIN changed, but restoring your data afterwards was interrupted partway through. " +
                "Do not uninstall Tally. Restore your most recent backup from Settings to recover everything.",
        )
    }
}
