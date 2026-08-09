package com.tally.app.data

import com.tally.app.security.VaultCrypto
import com.tally.app.util.JsonValue
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import javax.crypto.SecretKey

/**
 * Tally — resilient batch decryption. Kotlin/coroutine port of
 * src/store/decryptBatch.ts.
 *
 * `hydrateAll` used to decrypt every record with a bare `Promise.all` (the
 * web app's original bug), which fails on the FIRST bad record — one
 * unreadable transaction out of thousands failed the entire unlock,
 * permanently, even with the correct PIN. `decryptBatch` instead decrypts
 * every record independently (`kotlinx.coroutines.async` per record +
 * `runCatching`, the coroutine equivalent of `Promise.allSettled`): the
 * good ones come back, the bad ones are counted and dropped rather than
 * blocking access to everything else.
 *
 * Deliberately does not record or log *why* a record failed (wrong key vs.
 * malformed JSON vs. truncated ciphertext) — any such detail risks leaking
 * something about encrypted financial data, mirroring decryptBatch.ts's
 * same rule.
 */
data class DecryptBatchResult<T>(val items: List<T>, val skipped: Int)

suspend fun <T> decryptBatch(
    records: List<EncryptedRow>,
    decryptOne: suspend (EncryptedRow) -> T,
): DecryptBatchResult<T> = coroutineScope {
    val deferred = records.map { r -> async { runCatching { decryptOne(r) } } }
    val results = deferred.awaitAll()
    val items = ArrayList<T>(results.size)
    var skipped = 0
    for (r in results) {
        r.onSuccess { items.add(it) }.onFailure { skipped++ }
    }
    DecryptBatchResult(items, skipped)
}

suspend fun <T> decryptAll(
    records: List<EncryptedRow>,
    key: SecretKey,
    fromJson: (JsonValue.Obj) -> T,
): DecryptBatchResult<T> = decryptBatch(records) { r ->
    val json = VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(r.iv, r.ct))
    val obj = com.tally.app.util.Json.parse(json) as JsonValue.Obj
    fromJson(obj)
}

/** Like `decryptAll`, but keeps each record's storage id alongside its decrypted value (needed for budgets, which have no `id` field of their own). */
suspend fun <T> decryptAllWithIds(
    records: List<EncryptedRow>,
    key: SecretKey,
    fromJson: (JsonValue.Obj) -> T,
): DecryptBatchResult<Pair<String, T>> = decryptBatch(records) { r ->
    val json = VaultCrypto.decryptJSON(key, VaultCrypto.EncryptedBlob(r.iv, r.ct))
    val obj = com.tally.app.util.Json.parse(json) as JsonValue.Obj
    r.id to fromJson(obj)
}
