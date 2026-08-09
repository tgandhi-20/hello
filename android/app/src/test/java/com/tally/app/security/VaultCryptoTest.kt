package com.tally.app.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/**
 * Deliverable 6: "PBKDF2 output matches the web implementation for a known
 * input" and "IV uniqueness across records."
 *
 * The known-answer values below are NOT invented — they were computed
 * independently, off this codebase, in two ways that must agree with each
 * other for the vector to mean anything:
 *   1. Node's WebCrypto (`crypto.subtle.deriveBits` / `.encrypt`) — the
 *      exact API src/security/crypto.ts calls.
 *   2. Node's `crypto.pbkdf2Sync` — an independent PBKDF2 implementation.
 * Both produced the identical 32-byte key for the same (pin, salt,
 * iterations) input, and the identical AES-GCM ciphertext for the same
 * (key, iv, plaintext). This test asserts `VaultCrypto` reproduces those
 * same bytes — i.e. that THIS Kotlin code is byte-compatible with what the
 * web app actually does, not merely "uses a similarly-named algorithm."
 */
class VaultCryptoTest {

    private val knownPin = "123456"
    private val knownSalt = byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)
    private val expectedKeyHex = "93922e39f17be3ac82ee49e41b689b2f825ffcb9b18c64406350c92b4fa3c59c"
    private val expectedSaltB64 = "AAECAwQFBgcICQoLDA0ODw=="

    // Fixed all-zero IV + the verifier's exact plaintext, encrypted under the
    // key above — independently produced by Node's crypto.subtle.encrypt.
    private val fixedIv = ByteArray(12)
    private val expectedVerifierCtB64 = "xljx3/3bvBpURZM4RB9H59cjGxvIcfYXD4eobVPmy+x9JnXPIyGq3EBENuKLFg=="

    private fun toHex(bytes: ByteArray): String {
        val sb = StringBuilder()
        for (b in bytes) sb.append(String.format("%02x", b))
        return sb.toString()
    }

    @Test
    fun `PBKDF2 matches the web app's WebCrypto derivation for a known vector`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        assertEquals(expectedKeyHex, toHex(key.encoded))
    }

    @Test
    fun `salt base64 encoding matches btoa's output`() {
        assertEquals(expectedSaltB64, VaultCrypto.b64(knownSalt))
        assertTrue(knownSalt.contentEquals(VaultCrypto.unb64(expectedSaltB64)))
    }

    @Test
    fun `AES-GCM ciphertext matches WebCrypto byte-for-byte with a fixed IV and known key`() {
        val derivedKey = VaultCrypto.deriveKey(knownPin, knownSalt)
        val key = javax.crypto.spec.SecretKeySpec(derivedKey.encoded, "AES")

        // Directly exercise the same Cipher call shape VaultCrypto.encryptJSON
        // uses, but with a FIXED iv (not a fresh random one) so the ciphertext
        // is deterministic and comparable to the independently-computed vector.
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            javax.crypto.Cipher.ENCRYPT_MODE,
            key,
            javax.crypto.spec.GCMParameterSpec(VaultCrypto.GCM_TAG_BITS, fixedIv),
        )
        val ct = cipher.doFinal("{\"marker\":\"tally-verifier-v1\"}".toByteArray(Charsets.UTF_8))
        assertEquals(expectedVerifierCtB64, Base64.getEncoder().encodeToString(ct))
    }

    @Test
    fun `makeVerifier and checkVerifier round-trip and reject a wrong key`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        val wrongKey = VaultCrypto.deriveKey("999999", knownSalt)

        val verifier = VaultCrypto.makeVerifier(key)
        assertTrue(VaultCrypto.checkVerifier(key, verifier))
        assertFalse(VaultCrypto.checkVerifier(wrongKey, verifier))
    }

    @Test
    fun `checkVerifier never throws on garbage input`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        val garbage = VaultCrypto.EncryptedBlob(iv = "not-base64!!", ct = "also-not-base64!!")
        assertFalse(VaultCrypto.checkVerifier(key, garbage))
    }

    @Test
    fun `IV is unique across many records encrypted under the same key`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        val ivs = HashSet<String>()
        repeat(500) {
            val blob = VaultCrypto.encryptJSON(key, "{\"n\":$it}")
            assertTrue("IV repeated at iteration $it", ivs.add(blob.iv))
        }
        assertEquals(500, ivs.size)
    }

    @Test
    fun `IV is exactly 12 bytes as required by AES-GCM`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        val blob = VaultCrypto.encryptJSON(key, "{}")
        assertEquals(VaultCrypto.IV_BYTES, VaultCrypto.unb64(blob.iv).size)
    }

    @Test
    fun `decrypt round-trips arbitrary JSON text`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        val plaintext = "{\"merchant\":\"Campos Coffee\",\"amountCents\":550,\"note\":\"unicode: café ☕\"}"
        val blob = VaultCrypto.encryptJSON(key, plaintext)
        assertEquals(plaintext, VaultCrypto.decryptJSON(key, blob))
    }

    @Test
    fun `two encryptions of the same plaintext produce different ciphertext`() {
        val key = VaultCrypto.deriveKey(knownPin, knownSalt)
        val a = VaultCrypto.encryptJSON(key, "{\"x\":1}")
        val b = VaultCrypto.encryptJSON(key, "{\"x\":1}")
        assertNotEquals(a.ct, b.ct)
        assertNotEquals(a.iv, b.iv)
    }
}
