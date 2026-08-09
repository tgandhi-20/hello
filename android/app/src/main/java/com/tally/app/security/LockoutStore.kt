package com.tally.app.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.StrongBoxUnavailableException
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Durable storage for `LockoutState` (deliverable 5's P0 fix — see
 * LockoutPolicy.kt's doc comment for the bug this closes: the web app kept
 * this in React state, so a reload reset it).
 *
 * Backed by `EncryptedSharedPreferences` (androidx.security-crypto) rather
 * than plain `SharedPreferences` — this is not financial data, but it is
 * exactly the kind of thing a rooted/compromised-device attacker would want
 * to edit to erase their own failed-attempt history before it discourages
 * an offline PIN-guessing pass; encrypting it at rest with a Keystore-backed
 * master key is a small amount of defense in depth for a near-zero cost.
 *
 * StrongBox is requested for the master key when available, with a plain
 * (TEE-backed, non-StrongBox) fallback on `StrongBoxUnavailableException` —
 * some devices report API 28+ but lack StrongBox hardware, or their
 * StrongBox HAL rejects these key parameters. This data must never become
 * unavailable because of that — see the class doc's "never lock the user
 * out" rule.
 *
 * If EVERY attempt to build encrypted prefs fails (a very locked-down
 * device, or a corrupted keystore), `read()` returns a fresh `LockoutState`
 * and `write()` is a no-op: the backoff silently stops persisting rather
 * than crashing anything. That is a deliberate fail-open choice — the
 * option was "backoff might not survive a restart" vs. "the user can be
 * locked out of their own finance app by a storage failure," and the
 * contract is explicit that the second one is never acceptable.
 */
class LockoutStore(context: Context) {
    private val appContext = context.applicationContext

    private val prefs: SharedPreferences? by lazy { buildPrefs() }

    private fun buildMasterKey(strongBox: Boolean): MasterKey =
        MasterKey.Builder(appContext, MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .setRequestStrongBoxBacked(strongBox)
            .build()

    private fun buildPrefs(): SharedPreferences? = try {
        val masterKey = try {
            buildMasterKey(strongBox = true)
        } catch (e: StrongBoxUnavailableException) {
            buildMasterKey(strongBox = false)
        }
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        null
    }

    fun read(): LockoutState {
        val p = prefs ?: return LockoutState()
        return LockoutState(
            failedAttempts = p.getInt(KEY_ATTEMPTS, 0),
            lockedUntilEpochMs = p.getLong(KEY_LOCKED_UNTIL, 0L),
        )
    }

    fun write(state: LockoutState) {
        val p = prefs ?: return
        p.edit()
            .putInt(KEY_ATTEMPTS, state.failedAttempts)
            .putLong(KEY_LOCKED_UNTIL, state.lockedUntilEpochMs)
            .apply()
    }

    companion object {
        private const val MASTER_KEY_ALIAS = "tally_lockout_master_key"
        private const val PREFS_NAME = "tally_lockout_prefs"
        private const val KEY_ATTEMPTS = "failed_attempts"
        private const val KEY_LOCKED_UNTIL = "locked_until_epoch_ms"
    }
}
