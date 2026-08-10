package com.tally.app.ui.lock

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.tally.app.data.VaultRepository
import com.tally.app.security.DEFAULT_PIN_LENGTH
import com.tally.app.security.MAX_PIN_LENGTH
import com.tally.app.security.MIN_PIN_LENGTH
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The vault's lock gate — the ONLY place in this app that can turn a locked
 * vault into a readable one. Shown by `TallyAppRoot` (`ui/nav/TallyApp.kt`)
 * whenever [VaultRepository.isUnlocked] is false. Branches on
 * [VaultRepository.isSetUp]:
 *  - not set up  -> [SetupPinFlow] (choose a PIN, confirm it, `setupPin`).
 *  - set up      -> [UnlockPinFlow] (PIN entry, `unlock`, optional biometric).
 *
 * `onUnlocked` is called exactly once, right after a successful
 * `setupPin`/`unlock`/`unlockBiometric` — the caller (`TallyAppRoot`) is
 * responsible for hydrating the data source and flipping the app shell into
 * view; this screen only ever proves the secret was correct.
 */
@Composable
fun LockScreen(repository: VaultRepository, onUnlocked: () -> Unit, modifier: Modifier = Modifier) {
    var isSetUp by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(repository) {
        isSetUp = repository.isSetUp()
    }

    when (isSetUp) {
        null -> LoadingLock(modifier)
        false -> SetupPinFlow(repository = repository, onComplete = onUnlocked, modifier = modifier)
        true -> UnlockPinFlow(repository = repository, onUnlocked = onUnlocked, modifier = modifier)
    }
}

@Composable
private fun LoadingLock(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().background(TallyColors.Ground),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = TallyColors.Accent)
    }
}

@Composable
private fun SetupPinFlow(repository: VaultRepository, onComplete: () -> Unit, modifier: Modifier = Modifier) {
    // null = still entering the first PIN; non-null = confirming it matches.
    var firstPin by remember { mutableStateOf<String?>(null) }
    var buffer by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun onKey(key: String) {
        error = null
        buffer = applyPinKey(buffer, key)
    }

    fun continueTapped() {
        if (submitting || buffer.length < MIN_PIN_LENGTH) return
        val first = firstPin
        if (first == null) {
            firstPin = buffer
            buffer = ""
        } else if (buffer == first) {
            val pin = buffer
            submitting = true
            scope.launch {
                repository.setupPin(pin)
                onComplete()
            }
        } else {
            error = "Those PINs didn't match — try again."
            firstPin = null
            buffer = ""
        }
    }

    LockScaffold(
        modifier = modifier,
        headline = if (firstPin == null) "Choose a PIN" else "Confirm your PIN",
        subtitle = if (firstPin == null) {
            "$MIN_PIN_LENGTH to $MAX_PIN_LENGTH digits. This unlocks Tally on this device — nothing is sent anywhere."
        } else {
            "Enter the same PIN again."
        },
        buffer = buffer,
        message = error,
        pad = { PinPad(onKey = ::onKey, disabledBackspace = buffer.isEmpty()) },
        primaryAction = {
            Button(
                onClick = ::continueTapped,
                enabled = !submitting && buffer.length in MIN_PIN_LENGTH..MAX_PIN_LENGTH,
                colors = ButtonDefaults.buttonColors(
                    containerColor = TallyColors.Accent,
                    contentColor = TallyColors.InkOnAccent,
                    disabledContainerColor = TallyColors.SurfaceSunk,
                    disabledContentColor = TallyColors.Ink3,
                ),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) {
                Text(text = if (firstPin == null) "Continue" else "Confirm", style = MaterialTheme.typography.titleSmall)
            }
        },
    )
}

@Composable
private fun UnlockPinFlow(repository: VaultRepository, onUnlocked: () -> Unit, modifier: Modifier = Modifier) {
    var buffer by remember { mutableStateOf("") }
    var pinLength by remember { mutableStateOf(DEFAULT_PIN_LENGTH) }
    var biometricAvailable by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var lockedUntilMs by remember { mutableStateOf(0L) }
    var remainingSeconds by remember { mutableStateOf(0) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val activity = context as? FragmentActivity

    LaunchedEffect(repository) {
        pinLength = repository.getUnlockConfig().pinLength
        biometricAvailable = repository.hasBiometricConfigured()
        val state = repository.currentLockoutState()
        if (state.lockedUntilEpochMs > System.currentTimeMillis()) {
            lockedUntilMs = state.lockedUntilEpochMs
        }
    }

    // Live countdown while a wrong-attempt backoff is in effect — never a
    // dead end, always a visible reason and an end time.
    LaunchedEffect(lockedUntilMs) {
        while (lockedUntilMs > System.currentTimeMillis()) {
            remainingSeconds = ((lockedUntilMs - System.currentTimeMillis() + 999) / 1000).toInt().coerceAtLeast(0)
            delay(1000)
        }
        remainingSeconds = 0
    }

    fun handleResult(result: VaultRepository.UnlockResult) {
        submitting = false
        when (result) {
            is VaultRepository.UnlockResult.Ok -> {
                buffer = ""
                message = null
                onUnlocked()
            }
            is VaultRepository.UnlockResult.WrongSecret -> {
                buffer = ""
                val state = repository.currentLockoutState()
                if (state.lockedUntilEpochMs > System.currentTimeMillis()) {
                    lockedUntilMs = state.lockedUntilEpochMs
                    message = null
                } else {
                    val n = state.failedAttempts
                    message = "Wrong PIN — $n failed attempt${if (n == 1) "" else "s"}."
                }
            }
            is VaultRepository.UnlockResult.LockedOut -> {
                buffer = ""
                lockedUntilMs = System.currentTimeMillis() + result.remainingMs
            }
            is VaultRepository.UnlockResult.NotSetUp -> {
                buffer = ""
                message = "This vault isn't set up on this device yet. Restart Tally to set a PIN."
            }
            is VaultRepository.UnlockResult.BiometricUnavailable -> {
                // Never a dead end — the PIN pad underneath still works.
                message = "Fingerprint unlock isn't available right now — use your PIN."
            }
        }
    }

    fun isLockedOut(): Boolean = lockedUntilMs > System.currentTimeMillis()

    fun submit() {
        if (submitting || isLockedOut() || buffer.isEmpty()) return
        submitting = true
        scope.launch { handleResult(repository.unlock(buffer)) }
    }

    fun onKey(key: String) {
        if (isLockedOut() || submitting) return
        message = null
        buffer = applyPinKey(buffer, key)
        if (buffer.length >= pinLength) submit()
    }

    fun tryBiometric() {
        val act = activity ?: return
        if (isLockedOut() || submitting) return
        submitting = true
        scope.launch {
            handleResult(repository.unlockBiometric(act, ContextCompat.getMainExecutor(context)))
        }
    }

    val locked = isLockedOut()

    LockScaffold(
        modifier = modifier,
        headline = "Enter your PIN",
        subtitle = if (locked) "Too many wrong attempts — try again in ${remainingSeconds}s." else null,
        buffer = buffer,
        message = message,
        pad = { PinPad(onKey = ::onKey, disabledBackspace = buffer.isEmpty() || locked) },
        primaryAction = {
            if (biometricAvailable && activity != null) {
                TextButton(onClick = ::tryBiometric, enabled = !locked && !submitting) {
                    Text(text = "Use fingerprint instead", color = TallyColors.Accent)
                }
            }
        },
    )
}

/**
 * Shared layout for both setup and unlock: headline, an optional subtitle
 * (used for the lockout countdown), a masked buffer readout, an optional
 * error/status line, the pad, and an optional primary action — all inside a
 * `verticalScroll` column so nothing can fall off-screen in landscape (see
 * [PinPad]'s own doc comment for why that matters here specifically).
 */
@Composable
private fun LockScaffold(
    headline: String,
    subtitle: String?,
    buffer: String,
    message: String?,
    pad: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    primaryAction: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(text = "Tally", style = TallyType.Label, color = TallyColors.Ink2)
        Text(text = headline, style = TallyType.Headline, color = TallyColors.Ink1)
        if (subtitle != null) {
            Text(text = subtitle, style = TallyType.Body, color = TallyColors.Ink2)
        }
        Text(
            // A masked, count-only readout — never the digits themselves.
            text = if (buffer.isEmpty()) "Enter PIN" else "•".repeat(buffer.length),
            style = TallyType.MoneyHero,
            color = TallyColors.Ink1,
        )
        if (message != null) {
            Text(text = message, style = TallyType.Body, color = TallyColors.Critical)
        }
        pad()
        primaryAction?.invoke()
    }
}
