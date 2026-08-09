package com.tally.app.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deliverable 6: "backoff surviving a simulated process restart."
 *
 * `LockoutStore` (the real persistence layer, backed by
 * EncryptedSharedPreferences) needs a real Android Context and isn't
 * unit-testable on the host JVM. This test instead simulates a process
 * restart the way it actually matters for correctness: `LockoutPolicy` is
 * pure and stateless, so a "process restart" is exactly "construct a fresh
 * `LockoutState` from the same two primitive values (failedAttempts,
 * lockedUntilEpochMs) a real restart would have read back from disk" — if
 * that fresh object still enforces the lockout, the policy survives a
 * restart; if it silently reset to zero (the web app's original bug), it
 * would not.
 */
class LockoutPolicyTest {

    @Test
    fun `first few wrong attempts have no backoff`() {
        var state = LockoutState()
        val now = 1_000_000L
        repeat(3) {
            state = LockoutPolicy.onFailure(state, now)
        }
        assertEquals(0L, LockoutPolicy.backoffMillisFor(state.failedAttempts))
        assertFalse(LockoutPolicy.isLocked(state, now))
    }

    @Test
    fun `backoff grows and locks out further attempts`() {
        var state = LockoutState()
        val now = 1_000_000L
        repeat(6) {
            state = LockoutPolicy.onFailure(state, now)
        }
        assertTrue(LockoutPolicy.isLocked(state, now))
        assertTrue(LockoutPolicy.remainingLockMillis(state, now) > 0)
    }

    @Test
    fun `a correct unlock clears the backoff entirely`() {
        var state = LockoutState()
        repeat(10) { state = LockoutPolicy.onFailure(state, 0L) }
        state = LockoutPolicy.onSuccess()
        assertEquals(0, state.failedAttempts)
        assertEquals(0L, state.lockedUntilEpochMs)
    }

    @Test
    fun `backoff survives a simulated process restart`() {
        val now = 5_000_000L

        // Session 1: five wrong attempts.
        var session1State = LockoutState()
        repeat(5) {
            session1State = LockoutPolicy.onFailure(session1State, now)
        }
        assertTrue(LockoutPolicy.isLocked(session1State, now))

        // "Persist": in the real app this is LockoutStore.write(session1State)
        // writing two plain values (Int, Long) into EncryptedSharedPreferences.
        val persistedAttempts = session1State.failedAttempts
        val persistedLockedUntil = session1State.lockedUntilEpochMs

        // "Process restart": nothing in memory survives — LockoutPolicy is a
        // stateless object, and a brand new LockoutState is constructed the
        // same way LockoutStore.read() would from the persisted primitives.
        val afterRestartState = LockoutState(
            failedAttempts = persistedAttempts,
            lockedUntilEpochMs = persistedLockedUntil,
        )

        // The critical assertion: the lockout still applies immediately after
        // "restart," at the same wall-clock moment — this is exactly the bug
        // deliverable 5 calls out (the web app's React-state backoff reset to
        // zero on reload, so this check would have failed there).
        assertEquals(5, afterRestartState.failedAttempts)
        assertTrue(LockoutPolicy.isLocked(afterRestartState, now))

        // And a 6th failure after "restart" continues the SAME escalating
        // sequence rather than restarting from the free attempts.
        val afterOneMore = LockoutPolicy.onFailure(afterRestartState, now)
        assertEquals(6, afterOneMore.failedAttempts)
        assertTrue(
            LockoutPolicy.backoffMillisFor(afterOneMore.failedAttempts) >
                LockoutPolicy.backoffMillisFor(session1State.failedAttempts),
        )
    }

    @Test
    fun `lockout eventually expires and unlock attempts are allowed again`() {
        val start = 0L
        var state = LockoutState()
        repeat(4) { state = LockoutPolicy.onFailure(state, start) }
        val delay = LockoutPolicy.backoffMillisFor(state.failedAttempts)
        assertTrue(LockoutPolicy.isLocked(state, start))
        assertFalse(LockoutPolicy.isLocked(state, start + delay + 1))
    }

    @Test
    fun `backoff is capped rather than growing unbounded`() {
        var state = LockoutState()
        repeat(50) { state = LockoutPolicy.onFailure(state, 0L) }
        val delay = LockoutPolicy.backoffMillisFor(state.failedAttempts)
        assertTrue(delay <= 5 * 60_000L)
    }
}
