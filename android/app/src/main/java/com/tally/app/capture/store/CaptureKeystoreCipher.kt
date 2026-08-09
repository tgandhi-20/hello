package com.tally.app.capture.store

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private const val KEY_ALIAS = "tally_capture_buffer_key"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val GCM_TAG_BITS = 128
private const val GCM_IV_BYTES = 12

/**
 * AES-256-GCM encryption for the pending-capture buffer, keyed by a
 * non-exportable key held in the Android Keystore (backed by the device's
 * TEE/StrongBox, never present as raw key material in process memory or on
 * disk).
 *
 * ## Why this instead of `androidx.security:security-crypto`'s `EncryptedSharedPreferences`
 *
 * `EncryptedSharedPreferences` is the API ANDROID.md §3 and this task's brief
 * both name -- and it would have been used here, except: as of this module's
 * writing, the library's latest **stable** release is `1.1.0` (30 July 2025),
 * and that release deprecated every API in the artifact, including
 * `EncryptedSharedPreferences` and `MasterKey`, in favour of using Android
 * Keystore directly (deprecation introduced in `1.1.0-beta01`'s release
 * notes). Pulling in a dependency whose entire public surface is deprecated on
 * arrival, for a build that cannot be compiled or dependency-resolved locally
 * to double-check it still works cleanly against AGP 8.5.2/compileSdk 34, is a
 * worse bet than not adding it at all -- especially since "encrypted at rest,
 * Keystore-backed" was explicitly offered as an equally acceptable choice.
 *
 * This class is that equivalent: a small, direct AES/GCM-over-Keystore wrapper
 * with the exact same at-rest guarantee `EncryptedSharedPreferences` would
 * have given (ciphertext is the only thing that ever reaches disk), zero new
 * Gradle dependencies, and nothing to go stale.
 *
 * `setUserAuthenticationRequired` is deliberately left at its default
 * (`false`): the notification listener must be able to write a captured item
 * while the phone is locked (a notification can post at any time), so the key
 * cannot require a biometric/keyguard unlock to use. It is still
 * non-exportable and scoped to this app -- no other app, and no `adb backup`
 * of an unrooted device, can read the key material or use it to decrypt these
 * values.
 */
internal object CaptureKeystoreCipher {

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }

    /** Returns Base64 (no wrap) of `IV || ciphertext`. */
    fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(iv + ciphertext, Base64.NO_WRAP)
    }

    /** Inverse of [encrypt]. Throws if `encoded` is malformed or was not produced by this key. */
    fun decrypt(encoded: String): String {
        val combined = Base64.decode(encoded, Base64.NO_WRAP)
        require(combined.size > GCM_IV_BYTES) { "ciphertext too short to contain an IV" }
        val iv = combined.copyOfRange(0, GCM_IV_BYTES)
        val ciphertext = combined.copyOfRange(GCM_IV_BYTES, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }
}
