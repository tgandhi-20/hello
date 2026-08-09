package com.tally.app.security

import javax.crypto.SecretKey

/**
 * The current unlocked vault key, held ONLY in memory — Kotlin port of
 * src/security/crypto.ts's `activeKey`/`getActiveKey`/`setActiveKey`/`zeroKey`.
 * Never persisted, never logged.
 *
 * Cleared on every explicit `lock()`, on auto-lock (AutoLockPolicy), and on
 * process death for free: this is a plain in-process singleton, so when the
 * process dies there is nothing left to restore from — which is exactly
 * what "lock on process death" (deliverable 5) means. The wrapped copy of
 * the key persisted for biometric unlock (KeystoreVaultKeyWrapper) is the
 * only thing that survives a process death, and unwrapping it always
 * requires a fresh biometric check.
 */
object VaultKeyHolder {
    @Volatile
    private var activeKey: SecretKey? = null

    fun get(): SecretKey? = activeKey

    fun set(key: SecretKey) {
        activeKey = key
    }

    /** Drop the in-memory reference to the vault key. Called on every lock. */
    fun clear() {
        activeKey = null
    }

    fun isUnlocked(): Boolean = activeKey != null
}
