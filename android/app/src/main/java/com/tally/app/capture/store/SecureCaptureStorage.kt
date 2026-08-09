package com.tally.app.capture.store

import android.content.Context
import android.content.SharedPreferences
import com.tally.app.capture.model.PendingCapture
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

private const val PREFS_FILE = "tally_capture_secure_prefs"
private const val KEY_PENDING = "pending_items_v1"
private const val KEY_SEEN_SIGNATURES = "seen_signatures_v1"
private const val KEY_DROPPED_COUNT = "dropped_count_v1"

/** Bound on how many notification signatures are remembered, so this can never grow without limit; oldest is evicted first. */
private const val MAX_SEEN_SIGNATURES = 500

/**
 * [CaptureBuffer] backed by a private `SharedPreferences` file whose values
 * are AES-GCM ciphertext from [CaptureKeystoreCipher] -- a raw read of the
 * prefs XML (a rooted device, an `adb backup` if one were ever possible, a
 * misdirected bug report) reveals only opaque Base64, never a notification
 * string, an amount or a merchant. The buffer holds pending items only; it is
 * cleared item-by-item the moment `CaptureReviewQueue` accepts or dismisses
 * each one -- never a second copy of the ledger.
 *
 * This class cannot be exercised by a local JUnit test: `SharedPreferences`,
 * `android.util.Base64` and the Android Keystore are all Android-framework
 * APIs backed by stub jars in a plain `test/` unit test (this module's
 * `testOptions.unitTests.isReturnDefaultValues = true` means calls against
 * them silently return `null`/`0`/`false` rather than doing real work, so a
 * test written against this class would not actually prove anything). That is
 * exactly why [CaptureBuffer] exists as a separate, plain-Kotlin interface:
 * `CaptureIngestPipeline` and `CaptureReviewQueueImpl`'s tests run against an
 * in-memory fake implementing that same interface, which gives full coverage
 * of the actual capture/dedupe/review *logic* -- this class is deliberately
 * as thin as possible around it, doing persistence only.
 */
class SecureCaptureStorage(context: Context) : CaptureBuffer {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
    private val mutex = Mutex()

    override suspend fun pendingItems(): List<PendingCapture> = mutex.withLock { readPending() }

    override suspend fun addPending(item: PendingCapture) {
        mutex.withLock {
            val items = readPending() + item
            writePending(items)
        }
    }

    override suspend fun removePending(id: String) {
        mutex.withLock {
            writePending(readPending().filterNot { it.id == id })
        }
    }

    override suspend fun droppedCount(): Int = mutex.withLock { prefs.getInt(KEY_DROPPED_COUNT, 0) }

    override suspend fun incrementDropped() {
        mutex.withLock {
            prefs.edit().putInt(KEY_DROPPED_COUNT, prefs.getInt(KEY_DROPPED_COUNT, 0) + 1).apply()
        }
    }

    override suspend fun hasSeenSignature(signature: String): Boolean =
        mutex.withLock { readSignatures().contains(signature) }

    override suspend fun recordSignature(signature: String) {
        mutex.withLock {
            val signatures = readSignatures().toMutableList()
            if (signatures.contains(signature)) return@withLock
            signatures.add(signature)
            while (signatures.size > MAX_SEEN_SIGNATURES) signatures.removeAt(0)
            writeSignatures(signatures)
        }
    }

    // -- persistence -----------------------------------------------------

    private fun readPending(): List<PendingCapture> {
        val plaintext = decryptedOrNull(KEY_PENDING) ?: return emptyList()
        val array = runCatching { JSONArray(plaintext) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            runCatching { array.getJSONObject(i).toPendingCapture() }.getOrNull()
        }
    }

    private fun writePending(items: List<PendingCapture>) {
        val array = JSONArray()
        items.forEach { array.put(it.toJson()) }
        prefs.edit().putString(KEY_PENDING, CaptureKeystoreCipher.encrypt(array.toString())).apply()
    }

    private fun readSignatures(): List<String> {
        val plaintext = decryptedOrNull(KEY_SEEN_SIGNATURES) ?: return emptyList()
        val array = runCatching { JSONArray(plaintext) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { i -> array.optString(i, null) }
    }

    private fun writeSignatures(signatures: List<String>) {
        val array = JSONArray(signatures)
        prefs.edit().putString(KEY_SEEN_SIGNATURES, CaptureKeystoreCipher.encrypt(array.toString())).apply()
    }

    private fun decryptedOrNull(key: String): String? {
        val encoded = prefs.getString(key, null) ?: return null
        return runCatching { CaptureKeystoreCipher.decrypt(encoded) }.getOrNull()
    }
}

private fun PendingCapture.toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("packageName", packageName)
    .put("account", account ?: JSONObject.NULL)
    .put("amountCents", amountCents)
    .put("merchant", merchant)
    .put("rawText", rawText)
    .put("postedAt", postedAt)
    .put("dedupeHash", dedupeHash ?: JSONObject.NULL)

private fun JSONObject.toPendingCapture(): PendingCapture = PendingCapture(
    id = getString("id"),
    packageName = getString("packageName"),
    account = if (isNull("account")) null else getString("account"),
    amountCents = getLong("amountCents"),
    merchant = getString("merchant"),
    rawText = getString("rawText"),
    postedAt = getLong("postedAt"),
    dedupeHash = if (isNull("dedupeHash")) null else getString("dedupeHash")
)
