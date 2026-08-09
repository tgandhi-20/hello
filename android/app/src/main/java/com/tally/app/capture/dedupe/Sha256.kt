package com.tally.app.capture.dedupe

import java.security.MessageDigest

/** Lowercase-hex SHA-256, matching `src/security/crypto.ts`'s `sha256Hex` byte for byte. */
internal object Sha256 {
    fun hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) {
            sb.append(HEX_CHARS[(b.toInt() shr 4) and 0xF])
            sb.append(HEX_CHARS[b.toInt() and 0xF])
        }
        return sb.toString()
    }

    private val HEX_CHARS = "0123456789abcdef".toCharArray()
}
