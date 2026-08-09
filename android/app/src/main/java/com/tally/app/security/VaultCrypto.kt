package com.tally.app.security

import com.tally.app.util.Json
import com.tally.app.util.JsonValue
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Tally — cryptographic primitives. Kotlin port of src/security/crypto.ts
 * (CONTRACTS.md §5). PBKDF2-SHA256, 600,000 iterations, 16-byte random salt
 * -> 256-bit AES-GCM key; fresh random 12-byte IV per record.
 *
 * BYTE-COMPATIBILITY WITH THE WEB APP (deliverable 3's crypto half)
 * --------------------------------------------------------------------
 * Every primitive used here — `SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")`
 * fed a `PBEKeySpec(char[])`, and `Cipher.getInstance("AES/GCM/NoPadding")`
 * with a 128-bit GCM tag — implements the same standard (RFC 8018 PBKDF2,
 * NIST SP 800-38D AES-GCM) that WebCrypto's `crypto.subtle.deriveKey`/
 * `encrypt` also implements, and both treat the password/plaintext as UTF-8
 * bytes. This was verified directly, not assumed: a fixed (PIN, salt) pair
 * was derived independently with (a) Node's `crypto.subtle.deriveBits`,
 * (b) Node's `crypto.pbkdf2Sync`, and (c) this exact `javax.crypto` call
 * shape run on a plain JDK — all three produced the byte-identical 32-byte
 * key. Encrypting the same fixed plaintext with a fixed IV under that key
 * then produced byte-identical AES-GCM ciphertext across WebCrypto and
 * `javax.crypto` too. See VaultCryptoTest for the same known-answer values
 * asserted as JUnit tests.
 *
 * `java.util.Base64` (NOT `android.util.Base64`, which is an Android
 * framework stub unavailable to local JVM unit tests — see util/Json.kt's
 * doc comment for the same class of problem) matches `btoa`/`atob` exactly
 * and has been part of the JDK, and of Android, since API 26 — the same
 * minSdk this module already targets.
 */
object VaultCrypto {
    const val PBKDF2_ITERATIONS = 600_000
    const val SALT_BYTES = 16
    const val IV_BYTES = 12
    const val KEY_BITS = 256
    const val GCM_TAG_BITS = 128

    private const val VERIFIER_MARKER = "tally-verifier-v1"
    private const val VERIFIER_PLAINTEXT = "{\"marker\":\"$VERIFIER_MARKER\"}"

    /** Mirrors src/security/crypto.ts's `EncryptedBlob`: base64 IV + base64 AES-GCM ciphertext (tag included). */
    data class EncryptedBlob(val iv: String, val ct: String)

    /** Generate a fresh random 16-byte salt. Call once, at vault setup. */
    fun generateSalt(): ByteArray = ByteArray(SALT_BYTES).also { SecureRandom().nextBytes(it) }

    /**
     * Derive the 256-bit AES-GCM vault key from a secret (PIN or passphrase)
     * + salt. `secret`'s char array is zeroed as soon as derivation is done —
     * cheap hygiene in the same spirit as "never log a PIN or key."
     */
    fun deriveKey(secret: String, salt: ByteArray): SecretKey {
        val chars = secret.toCharArray()
        try {
            val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            val spec = PBEKeySpec(chars, salt, PBKDF2_ITERATIONS, KEY_BITS)
            try {
                val raw = factory.generateSecret(spec).encoded
                return SecretKeySpec(raw, "AES")
            } finally {
                spec.clearPassword()
            }
        } finally {
            chars.fill(' ')
        }
    }

    /** Encrypt any JSON string with a fresh random IV, unique per call. */
    fun encryptJSON(key: SecretKey, plaintextJson: String): EncryptedBlob {
        val iv = ByteArray(IV_BYTES).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        val ct = cipher.doFinal(plaintextJson.toByteArray(Charsets.UTF_8))
        return EncryptedBlob(b64(iv), b64(ct))
    }

    /** Decrypt a blob produced by `encryptJSON`. Throws if the key is wrong or the blob is corrupt. */
    fun decryptJSON(key: SecretKey, blob: EncryptedBlob): String {
        val iv = unb64(blob.iv)
        val ct = unb64(blob.ct)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        val pt = cipher.doFinal(ct)
        return String(pt, Charsets.UTF_8)
    }

    /** Fixed known-plaintext used to verify a PIN/derived key is correct without decrypting real data. */
    fun makeVerifier(key: SecretKey): EncryptedBlob = encryptJSON(key, VERIFIER_PLAINTEXT)

    /** Returns true iff `key` correctly decrypts `blob` to the expected marker. Never throws. */
    fun checkVerifier(key: SecretKey, blob: EncryptedBlob): Boolean = try {
        val text = decryptJSON(key, blob)
        val obj = Json.parse(text) as? JsonValue.Obj
        (obj?.entries?.get("marker") as? JsonValue.Str)?.value == VERIFIER_MARKER
    } catch (e: Exception) {
        // AES-GCM authentication failure (wrong key) or malformed JSON — either way, no.
        false
    }

    fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    fun unb64(s: String): ByteArray = Base64.getDecoder().decode(s)
}
