package com.tally.app.security

/**
 * Tally — auto-lock after 2 minutes backgrounded (CONTRACTS.md §5,
 * deliverable 5). Locking on process death comes for free from
 * `VaultKeyHolder` being a plain in-memory singleton (see its doc comment) —
 * this class only has to handle the "backgrounded but the process survives"
 * case.
 *
 * Mirrors useStore.ts's `visibilitychange` handler: records the wall-clock
 * time the app was backgrounded rather than relying solely on a running
 * timer, because Android can suspend/defer background work (Doze, App
 * Standby) — a `Handler.postDelayed` might not fire promptly. On the next
 * foreground transition, elapsed wall-clock time is checked directly as a
 * backstop, in addition to whatever best-effort scheduled callback the
 * caller also set up.
 *
 * DEPENDENCY NOTE: this deliberately does NOT use `ProcessLifecycleOwner`
 * (androidx.lifecycle-process) — that artifact is not one of this module's
 * four permitted dependencies (Room, androidx.security-crypto,
 * androidx.biometric, coroutines). Instead it exposes plain
 * `onBackgrounded()`/`onForegrounded()` hooks. The ui/** agent (outside this
 * module's ownership) wires these into its own Activity/Lifecycle callbacks
 * using the androidx.activity/androidx.lifecycle-runtime-ktx APIs already in
 * the project's baseline dependencies — e.g. `onPause`/`onStop` and
 * `onResume`, or a `DefaultLifecycleObserver` on the Activity itself.
 */
class AutoLockPolicy(private val onLock: () -> Unit) {
    @Volatile
    private var backgroundedAtEpochMs: Long = 0L

    /** Call when the app leaves the foreground (e.g. Activity onStop). */
    fun onBackgrounded(now: Long = System.currentTimeMillis()) {
        backgroundedAtEpochMs = now
    }

    /**
     * Call when the app returns to the foreground (e.g. Activity onStart).
     * Locks immediately if the timeout already elapsed while backgrounded.
     */
    fun onForegrounded(timeoutMs: Long, now: Long = System.currentTimeMillis()) {
        val since = backgroundedAtEpochMs
        backgroundedAtEpochMs = 0L
        if (since != 0L && now - since >= timeoutMs) {
            onLock()
        }
    }

    /**
     * Best-effort proactive check — call from a scheduled coroutine delay or
     * Handler posted at `onBackgrounded()` time, so the vault locks even if
     * the app is never brought back to the foreground at all (e.g. the user
     * switches away and never returns). Returns true (and fires `onLock`)
     * if still backgrounded past the timeout.
     */
    fun checkStillBackgroundedAndLock(timeoutMs: Long, now: Long = System.currentTimeMillis()): Boolean {
        val since = backgroundedAtEpochMs
        val expired = since != 0L && now - since >= timeoutMs
        if (expired) onLock()
        return expired
    }
}
