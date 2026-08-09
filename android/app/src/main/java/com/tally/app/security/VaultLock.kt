package com.tally.app.security

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Tally — whole-vault write lock. Kotlin/coroutine port of
 * src/store/vaultLock.ts's intent (see that file's doc comment for the full
 * story): PIN/passphrase rotation and backup restore each snapshot the
 * whole vault, spend real time re-encrypting it under a different key, then
 * flip which key is "current" — an ordinary mutation that lands mid-way
 * would be written under the OLD key but isn't part of that snapshot, so it
 * becomes permanently unreadable once the key pointer flips.
 *
 * The web version needs a cross-tab primitive (the Web Locks API) because a
 * PWA can have two tabs open on the same origin at once. A native Android
 * app is a single process talking to a single Room/SQLite connection, so a
 * plain coroutine `Mutex` provides the same guarantee — every write-path
 * operation acquires it before touching the database and holds it for the
 * whole critical section — with much less machinery than the web needs.
 *
 * NOT REENTRANT — do not call `withLock` from inside a block already
 * running inside another `withLock` call; the second call would queue
 * behind the first and neither would ever finish. Compose at the call site
 * instead (await one wrapped call, then await the next).
 */
object VaultLock {
    private val mutex = Mutex()

    suspend fun <T> withLock(block: suspend () -> T): T = mutex.withLock { block() }
}
