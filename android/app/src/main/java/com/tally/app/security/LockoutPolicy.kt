package com.tally.app.security

/**
 * Tally — wrong-attempt backoff (CONTRACTS.md §5's "wrong-attempt backoff",
 * deliverable 5's P0 fix).
 *
 * THE BUG THIS FIXES: the web app's backoff lived in React component state,
 * so a page reload reset the failed-attempt counter to zero — a backoff
 * that vanishes on reload is not a backoff at all; it only ever throttled
 * guesses within a single session. `LockoutState` is meant to be written to
 * durable storage (see LockoutStore) after every change and read back
 * before every unlock attempt, so a process death or app restart does not
 * reset it.
 *
 * This class is pure, dependency-free Kotlin — no Context, no Android
 * framework class, nothing that requires Robolectric — specifically so it
 * is directly JUnit-testable on the host JVM (see LockoutPolicyTest.kt,
 * including "survives a simulated process restart," which recreates a
 * `LockoutState` from plain persisted primitives the way a fresh process
 * would after reading them back from EncryptedSharedPreferences).
 */
data class LockoutState(
    val failedAttempts: Int = 0,
    val lockedUntilEpochMs: Long = 0L,
)

object LockoutPolicy {
    /** Attempts allowed before any delay kicks in — matches "someone fumbling the keypad" being free. */
    private const val FREE_ATTEMPTS = 3

    /** Cap so a very large attempt count can't overflow or produce an absurd delay. */
    private const val MAX_BACKOFF_MS = 5 * 60_000L // 5 minutes

    /** Exponential backoff after the free attempts: 1s, 2s, 4s, 8s, ... capped at MAX_BACKOFF_MS. */
    fun backoffMillisFor(failedAttempts: Int): Long {
        if (failedAttempts <= FREE_ATTEMPTS) return 0L
        val exponent = (failedAttempts - FREE_ATTEMPTS).coerceAtMost(20)
        val ms = 1000L shl (exponent - 1)
        return ms.coerceAtMost(MAX_BACKOFF_MS)
    }

    fun onFailure(state: LockoutState, now: Long): LockoutState {
        val nextAttempts = state.failedAttempts + 1
        val delay = backoffMillisFor(nextAttempts)
        return LockoutState(failedAttempts = nextAttempts, lockedUntilEpochMs = now + delay)
    }

    /** A correct unlock always clears the backoff entirely. */
    fun onSuccess(): LockoutState = LockoutState()

    fun isLocked(state: LockoutState, now: Long): Boolean = now < state.lockedUntilEpochMs

    fun remainingLockMillis(state: LockoutState, now: Long): Long =
        (state.lockedUntilEpochMs - now).coerceAtLeast(0L)
}
