package com.tally.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import com.tally.app.data.VaultRepository
import com.tally.app.ui.data.VaultTallyDataSource
import com.tally.app.ui.nav.TallyAppRoot
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyTheme

/**
 * Entry point. All real UI lives under `com.tally.app.ui` — this class wires
 * the theme, the real [VaultRepository]/[VaultTallyDataSource], and the
 * lock-gated app shell ([TallyAppRoot]) into the Activity, and drives
 * [VaultRepository.autoLock] from the Activity lifecycle (see
 * `AutoLockPolicy`'s own doc comment for why `onStop`/`onStart` — not a
 * process-death hook — is the right pair: process death locks for free
 * because the vault key lives only in memory).
 *
 * `FragmentActivity` (not plain `ComponentActivity`) — `androidx.biometric`'s
 * `BiometricPrompt` requires one; `VaultRepository`/`BiometricVaultUnlock`
 * already take `FragmentActivity` as their activity parameter. It is still a
 * `ComponentActivity` (`FragmentActivity` extends it), so `setContent { }`
 * from `androidx.activity.compose` works exactly the same.
 *
 * `DemoTallyDataSource` is NOT constructed or referenced anywhere in this
 * class — the only data source reachable from this production entry point
 * is [VaultTallyDataSource], backed by the real encrypted vault. The demo
 * source still exists in `ui/data/` behind `TallyApp`'s own default
 * parameter, for previews/tests that want the app shell without a vault.
 */
class MainActivity : FragmentActivity() {
    private lateinit var repository: VaultRepository
    private lateinit var dataSource: VaultTallyDataSource

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = VaultRepository.get(applicationContext)
        dataSource = VaultTallyDataSource(repository)

        setContent {
            TallyTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = TallyColors.Ground) {
                    TallyAppRoot(repository = repository, dataSource = dataSource)
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        // Record the moment we left the foreground — see AutoLockPolicy.kt's
        // doc comment for why this is wall-clock-based rather than a bare
        // delayed callback (Doze/App Standby can defer the latter).
        repository.autoLock.onBackgrounded()
    }

    override fun onStart() {
        super.onStart()
        // Locks immediately (via VaultRepository.autoLock's onLock callback)
        // if the configured window already elapsed while backgrounded.
        repository.autoLock.onForegrounded(timeoutMs = dataSource.lockTimeoutMs)
        // Whether that just fired or the vault was already locked for any
        // other reason (fresh process, explicit lock elsewhere), make sure
        // the UI-facing state agrees with reality before anything renders.
        if (!repository.isUnlocked()) {
            dataSource.onLocked()
        }
    }
}
