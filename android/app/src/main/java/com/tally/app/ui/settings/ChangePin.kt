package com.tally.app.ui.settings

import com.tally.app.data.VaultRepository
import com.tally.app.security.UnlockConfig
import com.tally.app.security.isValidPin

/**
 * Changing the PIN, done safely.
 *
 * This used to compose `VaultRepository`'s safe public writes by hand
 * (`setupPin` then a loop of `updateTxn`/`addCategory`/... calls), because
 * `VaultRepository` had no dedicated rekey primitive. That approach worked,
 * but left a real window open: `setupPin` committed the new salt/verifier as
 * its very first step, and the id-preserving rewrite loop that followed was
 * many independent, un-transacted writes. A process death or crash between
 * those two things left the vault readable under the NEW PIN but with only
 * some records rewritten -- and unrecoverable without a `.tally` backup.
 *
 * `VaultRepository.changeSecret` closes that window: it decrypts every store
 * under the OLD key, re-encrypts everything under a freshly generated salt
 * entirely in memory, and only then writes every re-encrypted record AND the
 * new salt/verifier/config in a single Room `@Transaction`-equivalent
 * (`database.withTransaction`, see that function's doc comment for exactly
 * why that's atomic). A crash at any point before that transaction returns
 * leaves the vault untouched and still readable under the OLD PIN -- there
 * is no longer an instant where the salt has moved but the records haven't.
 *
 * This function is now a thin adapter: validate the new PIN's shape, call
 * [VaultRepository.changeSecret], and translate its
 * [VaultRepository.ChangeSecretResult] into this package's own
 * [ChangePinResult] -- kept as a distinct type (rather than exposing the
 * repository's result type directly to `ui/`) so the PIN-specific copy
 * ("That's not the current PIN") lives here, in the ui/ layer, not in
 * `data/`.
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

    val newConfig = UnlockConfig(mode = UnlockConfig.MODE_PIN, pinLength = newPin.length)
    return when (val result = repository.changeSecret(currentPin, newPin, newConfig)) {
        is VaultRepository.ChangeSecretResult.Ok -> ChangePinResult.Ok
        is VaultRepository.ChangeSecretResult.WrongCurrentSecret -> ChangePinResult.WrongCurrentPin
        is VaultRepository.ChangeSecretResult.NotSetUp ->
            ChangePinResult.Failed("Tally isn't set up on this device yet.")
        is VaultRepository.ChangeSecretResult.LockedOut -> ChangePinResult.LockedOut(result.remainingMs)
        is VaultRepository.ChangeSecretResult.UnreadableRecords ->
            ChangePinResult.Failed(
                "${result.count} record(s) on this device could not be read, so nothing was changed. " +
                    "Your PIN is still the old one and every record is untouched. If this keeps " +
                    "happening, restore your most recent backup from Settings.",
            )
    }
}
