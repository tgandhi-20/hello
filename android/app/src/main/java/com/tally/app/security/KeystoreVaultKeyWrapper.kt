package com.tally.app.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Tally — Android Keystore-backed key that WRAPS (never derives, never
 * replaces) the PIN/passphrase-derived vault key, so biometric unlock can
 * hand the vault key back without ever storing it un-wrapped anywhere
 * (deliverable 2 — "the reason for going native": a PWA has no hardware
 * keystore to do this with).
 *
 * The wrapping key itself is generated inside the TEE (or StrongBox, a
 * discrete secure element, when available) and never leaves it in any
 * exportable form. It is configured with `setUserAuthenticationRequired(true)`
 * and (see below) a zero authentication-validity window, meaning: every
 * single use of this key — not just the first one after unlocking the
 * phone — requires a fresh biometric check, enforced by the hardware
 * itself. A compromised app process cannot use this key without the sensor
 * firing, because the OS/TEE — not application code — is what authorizes
 * each `Cipher` operation.
 *
 * STRONGBOX
 * StrongBox is requested first on API 28+ (`setIsStrongBoxBacked(true)`) —
 * a separate, tamper-resistant security chip distinct from the main TEE, on
 * devices that have one. `StrongBoxUnavailableException` (thrown by
 * `KeyGenerator.init`/`generateKey`, not by the spec builder itself) is
 * caught and the key is regenerated without that flag — a device or OS
 * version without StrongBox hardware, or whose StrongBox HAL rejects these
 * parameters, still gets a perfectly good TEE-backed key. This must never
 * be allowed to crash or block the user — see class-level docs on every
 * caller for "always falls back."
 *
 * WHAT STRONGBOX DOES NOT PROTECT AGAINST — stated plainly, not hand-waved:
 * it protects the WRAPPING key's bytes from ever being extracted even by
 * privileged software on a compromised OS (a discrete chip with its own
 * firmware, isolated from the AP). It does NOT protect the *vault key
 * itself* once unwrapped into process memory — after a successful
 * biometric check, the plaintext vault key briefly exists in this app's
 * heap exactly as it does on the PIN path, and a sufficiently privileged
 * on-device attacker (root, a kernel exploit) could read process memory at
 * that moment. It does NOT protect against a compromised biometric sensor
 * or spoofed fingerprint (that is Class 3/BIOMETRIC_STRONG's job, enforced
 * by the platform, not by this class). And it does nothing at all for the
 * PIN/passphrase unlock path, which never touches the Keystore — the PIN
 * remains the actual root of trust; biometric is convenience layered on
 * top, exactly as on the web app.
 */
object KeystoreVaultKeyWrapper {
    private const val PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "tally_biometric_wrap_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val GCM_TAG_BITS = 128
    const val GCM_IV_BYTES = 12

    private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

    /**
     * Create (or return the existing) Keystore wrapping key. Tries StrongBox
     * first on API 28+; falls back to the ordinary TEE-backed key on any
     * `StrongBoxUnavailableException`, or directly on API < 28 where the
     * concept doesn't exist. Never throws for "no StrongBox" — that is an
     * expected, handled case, not a failure.
     */
    fun getOrCreateKey(): SecretKey {
        val ks = keyStore()
        val existing = ks.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                generateKey(strongBox = true)
            } catch (e: StrongBoxUnavailableException) {
                generateKey(strongBox = false)
            }
        } else {
            generateKey(strongBox = false)
        }
    }

    private fun generateKey(strongBox: Boolean): SecretKey {
        val builder = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
        // No call to setUserAuthenticationValidityDurationSeconds: its
        // documented default (when unset) is 0 — authentication required for
        // EVERY use of the key, which is exactly what a per-operation
        // BiometricPrompt.CryptoObject flow needs. Explicitly passing 0 vs.
        // omitting it is equivalent; omitting avoids relying on a legacy API
        // whose non-zero-vs-negative semantics have shifted across API levels.

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Restrict to Class 3 (BIOMETRIC_STRONG) specifically — this app
            // has its own PIN, so the Keystore's device-credential fallback
            // (the phone's screen-lock PIN, a different secret entirely)
            // must not be allowed to authorize this key.
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        }

        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true)
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        keyGenerator.init(builder.build())
        return keyGenerator.generateKey()
    }

    /** True once a wrapping key has been created (i.e. biometric was enrolled at some point). */
    fun hasKey(): Boolean = keyStore().containsAlias(KEY_ALIAS)

    /** Deletes the wrapping key — e.g. on disableBiometric() or resetAll(). */
    fun deleteKey() {
        val ks = keyStore()
        if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS)
    }

    /**
     * A Cipher ready for a fresh wrap, in ENCRYPT_MODE with a Keystore-chosen
     * random IV (read back via `cipher.iv` after use). NOT yet authorized —
     * the caller must run it through `BiometricPrompt` (see
     * BiometricVaultUnlock) before calling `doFinal`.
     */
    fun newWrapCipher(): Cipher {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        return cipher
    }

    /**
     * A Cipher ready to unwrap a blob that was wrapped with IV `iv`. NOT yet
     * authorized — see `newWrapCipher`.
     */
    fun newUnwrapCipher(iv: ByteArray): Cipher {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher
    }
}
