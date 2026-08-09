package com.tally.app.security

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executor
import javax.crypto.Cipher
import kotlin.coroutines.resume

/**
 * Tally — bridges androidx.biometric's callback API to coroutines and wires
 * it to `KeystoreVaultKeyWrapper`, so a successful fingerprint/face check is
 * what actually authorizes the Keystore cipher operation, not just a UI
 * dialog result an attacker on a compromised device could fake by calling a
 * success callback directly (see BiometricPrompt.CryptoObject usage below —
 * the platform itself refuses to hand back an authorized `Cipher` without a
 * real hardware-verified check).
 *
 * EVERY function here returns null on ANY failure: no biometric enrolled,
 * hardware absent or disabled, the user cancels, too many failed attempts
 * (platform lockout), or a Keystore key invalidated by a newly-enrolled
 * fingerprint. Callers MUST treat null as "fall back to PIN" — deliverable
 * 2's non-negotiable — never as an error that blocks the user from their
 * own data. This mirrors src/security/biometric.ts's contract exactly.
 */
object BiometricVaultUnlock {

    fun isAvailable(context: Context): Boolean {
        val manager = BiometricManager.from(context)
        return manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }

    /**
     * Prompt biometrics, authorize a freshly-created Keystore wrap cipher,
     * and return the (wrappedVaultKeyBytes, ivBytes) pair on success. Null
     * on any failure — callers should treat biometric enrollment as simply
     * not having happened and continue with PIN-only unlock.
     */
    suspend fun wrapVaultKey(
        activity: FragmentActivity,
        executor: Executor,
        vaultKeyBytes: ByteArray,
        title: String,
        subtitle: String,
    ): Pair<ByteArray, ByteArray>? {
        val cipher = try {
            KeystoreVaultKeyWrapper.newWrapCipher()
        } catch (e: Exception) {
            return null
        }
        val authorized = authenticate(activity, executor, cipher, title, subtitle) ?: return null
        return try {
            val wrapped = authorized.doFinal(vaultKeyBytes)
            wrapped to authorized.iv
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Prompt biometrics, authorize a Keystore unwrap cipher for the stored
     * `iv`, and return the decrypted vault key bytes on success. Null on any
     * failure — callers fall back to PIN unlock.
     */
    suspend fun unwrapVaultKey(
        activity: FragmentActivity,
        executor: Executor,
        wrappedBytes: ByteArray,
        iv: ByteArray,
        title: String,
        subtitle: String,
    ): ByteArray? {
        val cipher = try {
            KeystoreVaultKeyWrapper.newUnwrapCipher(iv)
        } catch (e: Exception) {
            return null
        }
        val authorized = authenticate(activity, executor, cipher, title, subtitle) ?: return null
        return try {
            authorized.doFinal(wrappedBytes)
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun authenticate(
        activity: FragmentActivity,
        executor: Executor,
        cipher: Cipher,
        title: String,
        subtitle: String,
    ): Cipher? = suspendCancellableCoroutine { cont ->
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val resultCipher = result.cryptoObject?.cipher
                if (cont.isActive) cont.resume(resultCipher)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                // Every error path — user cancel, negative button ("use PIN
                // instead"), platform lockout, hardware unavailable, timeout —
                // is treated identically: unavailable right now, fall back.
                if (cont.isActive) cont.resume(null)
            }

            override fun onAuthenticationFailed() {
                // One failed read (wrong finger). Do not resume — the system
                // prompt keeps accepting retries on its own until it calls
                // onAuthenticationError (e.g. too many failures) or
                // onAuthenticationSucceeded.
            }
        }

        val prompt = BiometricPrompt(activity, executor, callback)
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Use PIN instead")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        try {
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        } catch (e: Exception) {
            if (cont.isActive) cont.resume(null)
            return@suspendCancellableCoroutine
        }

        cont.invokeOnCancellation {
            prompt.cancelAuthentication()
        }
    }
}
