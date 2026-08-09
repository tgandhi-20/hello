package com.tally.app.security

import com.tally.app.util.JsonValue
import com.tally.app.util.jsonObject
import com.tally.app.util.optInt
import com.tally.app.util.optString

/**
 * Tally — unlock mode configuration. Kotlin port of src/security/unlockMode.ts.
 *
 * A PIN and a passphrase are both just a string handed to the same
 * `VaultCrypto.deriveKey()` — this is not a second crypto scheme, only a
 * record of which kind of string the user chose and (for PIN mode) how many
 * digits, so the lock screen (owned by the ui/** agent) can draw the right
 * input widget BEFORE anything is decrypted. Not secret — stored in the
 * plain `meta` table alongside the salt and verifier, exactly as on the web.
 */
data class UnlockConfig(val mode: String, val pinLength: Int) {
    fun toJson(): JsonValue.Obj = jsonObject {
        put("mode", mode)
        put("pinLength", pinLength)
    }

    companion object {
        const val MODE_PIN = "pin"
        const val MODE_PASSPHRASE = "passphrase"

        val DEFAULT = UnlockConfig(mode = MODE_PIN, pinLength = DEFAULT_PIN_LENGTH)

        fun fromJson(o: JsonValue.Obj): UnlockConfig = UnlockConfig(
            mode = o.optString("mode", MODE_PIN),
            pinLength = o.optInt("pinLength", DEFAULT_PIN_LENGTH),
        )
    }
}

const val DEFAULT_PIN_LENGTH = 6
const val MIN_PIN_LENGTH = 4
const val MAX_PIN_LENGTH = 10

/** Below this, a passphrase's total keyspace can be smaller than a 6-digit PIN's. */
const val MIN_PASSPHRASE_LENGTH = 8

fun isValidPin(pin: String): Boolean =
    pin.length in MIN_PIN_LENGTH..MAX_PIN_LENGTH && pin.all { it.isDigit() }

fun isWeakPassphrase(value: String): Boolean = value.length < MIN_PASSPHRASE_LENGTH
