package com.tally.app.ui.settings

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.tally.app.capture.permission.NotificationAccessStatus
import com.tally.app.data.Backup
import com.tally.app.data.VaultRepository
import com.tally.app.money.Settings
import com.tally.app.personal.PLAN_DEFAULTS
import com.tally.app.security.MAX_PIN_LENGTH
import com.tally.app.ui.components.TallyBackHeader
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.model.centsToKeypadBuffer
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.keypadBufferToCents
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

/**
 * Settings -- back up/restore, PIN, biometric, auto-lock, notification
 * access, and full erase. Everything here is a thin UI over
 * [VaultRepository]'s existing safe primitives (`exportBackup`/
 * `importBackup`/`resetAll`/`enableBiometric`/`disableBiometric`/
 * `updateSettings`), plus [changePin] (this package's own `ChangePin.kt`)
 * for the one operation the vault has no direct primitive for.
 *
 * [onVaultChanged] is called after anything that mutates the vault as a
 * whole rather than through the data source's normal per-action update path
 * -- a restore, an erase, a PIN change, a settings tweak -- so the caller
 * (the orchestrator's data source) knows to re-hydrate. Safe to leave as a
 * no-op if nothing needs to react immediately; every mutation here still
 * takes effect in the vault regardless.
 */
@Composable
fun SettingsScreen(
    repository: VaultRepository,
    onBack: () -> Unit,
    onVaultChanged: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf(Settings()) }
    var biometricConfigured by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        settings = repository.hydrateAll().settings
        biometricConfigured = repository.hasBiometricConfigured()
    }

    LaunchedEffect(repository) { refresh() }

    fun onChanged() {
        scope.launch { refresh() }
        onVaultChanged()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        TallyBackHeader(onBack = onBack)

        Text(
            text = "Settings",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )

        if (statusMessage != null) {
            Text(
                text = statusMessage!!,
                style = MaterialTheme.typography.bodyMedium,
                color = TallyColors.Ink2,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TallySectionLabel("Budget")
                TallyListGroup {
                    AmountSettingRow(
                        title = "Monthly income",
                        currentCents = settings.monthlyIncomeCents,
                        setSubtitle = { "${formatMoney(it)} a month -- the Income line in the equation on Home." },
                        unsetSubtitle = "Not set -- Home can't show what's left to spend without it.",
                        dialogExplanation = "What you take home each month, after tax. This becomes the Income " +
                            "line in the equation on Home.",
                        suggestedCents = PLAN_DEFAULTS.monthlyIncomeCents,
                        onSave = { cents ->
                            scope.launch {
                                repository.updateSettings { it.copy(monthlyIncomeCents = cents) }
                                statusMessage = "Monthly income updated."
                                onChanged()
                            }
                        },
                    )
                    TallyDivider()
                    AmountSettingRow(
                        title = "Savings target",
                        currentCents = settings.savingsTargetCents,
                        setSubtitle = { "${formatMoney(it)} a month -- set aside before anything else, the Savings line in the equation." },
                        unsetSubtitle = "Not set -- nothing is being set aside for the deposit plan yet.",
                        dialogExplanation = "What you want to set aside every month, before anything else. This " +
                            "becomes the Savings line in the equation, and what the deposit plan tracks progress against.",
                        suggestedCents = PLAN_DEFAULTS.savingsTargetCents,
                        onSave = { cents ->
                            scope.launch {
                                repository.updateSettings { it.copy(savingsTargetCents = cents) }
                                statusMessage = "Savings target updated."
                                onChanged()
                            }
                        },
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TallySectionLabel("Data")
                TallyListGroup {
                    BackupRow(repository = repository, onStatus = { statusMessage = it })
                    TallyDivider()
                    RestoreRow(repository = repository, onRestored = {
                        statusMessage = "Backup restored."
                        onChanged()
                    })
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TallySectionLabel("Security")
                TallyListGroup {
                    ChangePinRow(repository = repository, onChanged = {
                        statusMessage = "PIN changed."
                        onChanged()
                    })
                    TallyDivider()
                    BiometricRow(
                        repository = repository,
                        configured = biometricConfigured,
                        onChanged = ::onChanged,
                    )
                    TallyDivider()
                    AutoLockRow(
                        repository = repository,
                        currentMs = settings.lockTimeoutMs,
                        onChanged = ::onChanged,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TallySectionLabel("Capture")
                TallyListGroup {
                    NotificationAccessRow()
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TallySectionLabel("Danger zone")
                TallyListGroup {
                    EraseRow(repository = repository, onErased = {
                        statusMessage = null
                        onVaultChanged()
                    })
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Monthly income / savings target.
//
// Before this section existed, neither number could be set anywhere in the
// app. Home's equation showed "Add your income" in the accent colour, which
// read exactly like a link, with nothing behind the tap -- a prompt with no
// way to answer it, the same shape of dead end the capture review screen had
// for "which card?" (docs/AGENT-BRIEF.md's own example). The savings target
// had no dead-end prompt pointing at it, but was equally unreachable: it
// could only ever be its zero default, which silently understates every
// "to spend"/"left" figure and the deposit plan's whole progress bar.
// ---------------------------------------------------------------------------

/**
 * Sanitises free-typed text into a valid amount-buffer string (`"6457.00"`),
 * the same shape [keypadBufferToCents]/[centsToKeypadBuffer] (`ui/model/Keypad.kt`)
 * already read and write for quick-add and the deposit-plan balance editor.
 * This field uses the OS keyboard rather than a custom keypad -- matching
 * every other text field already on this screen (the PIN fields, the backup
 * passphrase, the erase confirmation word) -- so unlike
 * `Keypad.kt`'s `applyKeypadKey`, which only ever sees one keystroke at a
 * time, this has to sanitise a whole pasted-or-typed string at once: strip
 * anything that isn't a digit or a dot, keep only the first dot, and cap the
 * integer/decimal digit counts the same way [keypadBufferToCents] does.
 * `internal`, not `private`, so it is covered directly by
 * `SettingsScreenLogicTest` without a Compose test harness.
 */
internal fun sanitizeAmountInput(raw: String): String {
    val digitsAndDot = raw.filter { it.isDigit() || it == '.' }
    val firstDot = digitsAndDot.indexOf('.')
    val oneDot = if (firstDot == -1) {
        digitsAndDot
    } else {
        digitsAndDot.substring(0, firstDot + 1) + digitsAndDot.substring(firstDot + 1).replace(".", "")
    }
    val parts = oneDot.split(".", limit = 2)
    val intPart = (parts.getOrNull(0) ?: "").take(6)
    val decPart = parts.getOrNull(1)?.take(2)
    return if (decPart != null) "$intPart.$decPart" else intPart
}

/**
 * One editable dollar amount, shown as a list row and edited through a
 * dialog -- the shared shape behind both "Monthly income" and "Savings
 * target". [currentCents] `<= 0` reads as "not set" ([unsetSubtitle]), the
 * same convention `UiMonthMoney.incomeUnset` already uses on Home, rather
 * than a literal `$0.00` standing in for "never told Tally". [suggestedCents]
 * is shown only as an example in the dialog, never written without the user
 * tapping Save -- nothing here auto-fills the vault on its own
 * (docs/AGENT-BRIEF.md section 2: "Nothing auto-commits").
 */
@Composable
private fun AmountSettingRow(
    title: String,
    currentCents: Long,
    setSubtitle: (Long) -> String,
    unsetSubtitle: String,
    dialogExplanation: String,
    suggestedCents: Long,
    onSave: (Long) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    var buffer by remember { mutableStateOf("") }

    fun startEditing() {
        buffer = if (currentCents > 0L) centsToKeypadBuffer(currentCents) else ""
        open = true
    }

    TallyListRow(
        title = title,
        subtitle = if (currentCents > 0L) setSubtitle(currentCents) else unsetSubtitle,
        chevron = true,
        onClick = ::startEditing,
    )

    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(dialogExplanation, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = "Dollars, e.g. ${suggestedCents / 100}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TallyColors.Ink3,
                    )
                    OutlinedTextField(
                        value = buffer,
                        onValueChange = { buffer = sanitizeAmountInput(it) },
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = keypadBufferToCents(buffer) > 0L,
                    onClick = {
                        onSave(keypadBufferToCents(buffer))
                        open = false
                    },
                ) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        )
    }
}

// ---------------------------------------------------------------------------
// Back up
// ---------------------------------------------------------------------------

@Composable
private fun BackupRow(repository: VaultRepository, onStatus: (String?) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) {
            busy = true
            scope.launch {
                val ok = withContext(Dispatchers.IO) {
                    try {
                        val bytes = repository.exportBackup()
                        context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } != null
                    } catch (e: Exception) {
                        false
                    }
                }
                busy = false
                onStatus(if (ok) "Backup saved." else "Couldn't save the backup -- try again.")
            }
        }
    }

    TallyListRow(
        title = "Back up",
        subtitle = "Save an encrypted copy of everything in Tally. This is your only copy outside " +
            "this phone -- keep it somewhere safe, and take a fresh one before changing your PIN " +
            "or restoring another backup.",
        chevron = true,
        onClick = {
            if (!busy) {
                launcher.launch("tally-backup-${LocalDate.now()}.tally")
            }
        },
    )
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

private sealed class RestoreStep {
    object Idle : RestoreStep()
    object Warning : RestoreStep()
    object EnterSecret : RestoreStep()
}

@Composable
private fun RestoreRow(repository: VaultRepository, onRestored: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf<RestoreStep>(RestoreStep.Idle) }
    var pickedBytes by remember { mutableStateOf<ByteArray?>(null) }
    var secret by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val pickLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = withContext(Dispatchers.IO) {
                    try {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    } catch (e: Exception) {
                        null
                    }
                }
                if (bytes == null) {
                    error = "Couldn't open that file -- try picking it again."
                    step = RestoreStep.Idle
                } else {
                    pickedBytes = bytes
                    error = null
                    step = RestoreStep.EnterSecret
                }
            }
        } else {
            step = RestoreStep.Idle
        }
    }

    TallyListRow(
        title = "Restore from backup",
        subtitle = "Replaces everything currently on this device with a saved .tally backup.",
        chevron = true,
        onClick = {
            error = null
            step = RestoreStep.Warning
        },
    )

    if (step is RestoreStep.Warning) {
        AlertDialog(
            onDismissRequest = { step = RestoreStep.Idle },
            title = { Text("Replace everything on this device?") },
            text = {
                Text(
                    "Restoring a backup deletes every transaction, category, budget and setting " +
                        "currently on this device and replaces them with what's in the backup file. " +
                        "This cannot be undone. Your backup file itself is validated before anything " +
                        "on this device is touched -- if it's not readable, nothing changes.",
                )
            },
            confirmButton = {
                Button(onClick = {
                    step = RestoreStep.Idle
                    pickLauncher.launch(arrayOf("application/octet-stream", "*/*"))
                }) { Text("Choose backup file") }
            },
            dismissButton = { TextButton(onClick = { step = RestoreStep.Idle }) { Text("Cancel") } },
        )
    }

    if (step is RestoreStep.EnterSecret) {
        AlertDialog(
            onDismissRequest = { if (!busy) { step = RestoreStep.Idle; secret = "" } },
            title = { Text("Unlock this backup") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Enter the PIN or passphrase this backup was made with.")
                    OutlinedTextField(
                        value = secret,
                        onValueChange = { secret = it },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        enabled = !busy,
                    )
                    if (error != null) {
                        Text(error!!, color = TallyColors.Critical, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = secret.isNotEmpty() && !busy,
                    onClick = {
                        val bytes = pickedBytes
                        if (bytes != null) {
                            busy = true
                            error = null
                            scope.launch {
                                val failure = withContext(Dispatchers.IO) {
                                    try {
                                        repository.importBackup(bytes, secret)
                                        null
                                    } catch (e: Backup.WrongSecretException) {
                                        "That PIN or passphrase doesn't match this backup."
                                    } catch (e: Backup.InvalidBackupException) {
                                        e.message ?: "That file isn't a valid Tally backup."
                                    } catch (e: Exception) {
                                        "The restore couldn't be completed. Nothing on this device changes unless a restore fully succeeds."
                                    }
                                }
                                busy = false
                                if (failure == null) {
                                    step = RestoreStep.Idle
                                    secret = ""
                                    pickedBytes = null
                                    onRestored()
                                } else {
                                    error = failure
                                }
                            }
                        }
                    },
                ) { Text("Restore") }
            },
            dismissButton = {
                TextButton(onClick = { if (!busy) { step = RestoreStep.Idle; secret = "" } }) { Text("Cancel") }
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Change PIN
// ---------------------------------------------------------------------------

private sealed class ChangePinStep {
    object EnterCurrent : ChangePinStep()
    object EnterNew : ChangePinStep()
}

@Composable
private fun ChangePinRow(repository: VaultRepository, onChanged: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    var step by remember { mutableStateOf<ChangePinStep>(ChangePinStep.EnterCurrent) }
    var currentPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun resetAndOpen() {
        step = ChangePinStep.EnterCurrent
        currentPin = ""
        newPin = ""
        confirmPin = ""
        error = null
        busy = false
        open = true
    }

    TallyListRow(
        title = "Change PIN",
        subtitle = "Back up your data first (see Back up above) -- this re-encrypts everything on this device.",
        chevron = true,
        onClick = { resetAndOpen() },
    )

    if (open) {
        val onCurrentStep = step is ChangePinStep.EnterCurrent
        AlertDialog(
            onDismissRequest = { if (!busy) open = false },
            title = { Text(if (onCurrentStep) "Enter your current PIN" else "Choose a new PIN") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (onCurrentStep) {
                        OutlinedTextField(
                            value = currentPin,
                            onValueChange = { v -> if (v.length <= MAX_PIN_LENGTH) currentPin = v.filter(Char::isDigit) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            enabled = !busy,
                        )
                    } else {
                        OutlinedTextField(
                            value = newPin,
                            onValueChange = { v -> if (v.length <= MAX_PIN_LENGTH) newPin = v.filter(Char::isDigit) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            enabled = !busy,
                        )
                        OutlinedTextField(
                            value = confirmPin,
                            onValueChange = { v -> if (v.length <= MAX_PIN_LENGTH) confirmPin = v.filter(Char::isDigit) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            enabled = !busy,
                        )
                    }
                    if (error != null) {
                        Text(error!!, color = TallyColors.Critical, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                val canContinue = if (onCurrentStep) currentPin.isNotEmpty() else newPin.isNotEmpty() && confirmPin.isNotEmpty()
                Button(
                    enabled = canContinue && !busy,
                    onClick = {
                        if (onCurrentStep) {
                            error = null
                            step = ChangePinStep.EnterNew
                        } else if (newPin != confirmPin) {
                            error = "Those PINs didn't match -- try again."
                            newPin = ""
                            confirmPin = ""
                        } else {
                            busy = true
                            error = null
                            scope.launch {
                                when (val result = changePin(repository, currentPin, newPin)) {
                                    is ChangePinResult.Ok -> {
                                        busy = false
                                        open = false
                                        onChanged()
                                    }
                                    is ChangePinResult.WrongCurrentPin -> {
                                        busy = false
                                        error = "That's not the current PIN."
                                        step = ChangePinStep.EnterCurrent
                                        currentPin = ""
                                    }
                                    is ChangePinResult.InvalidNewPin -> {
                                        busy = false
                                        error = result.reason
                                        newPin = ""
                                        confirmPin = ""
                                    }
                                    is ChangePinResult.LockedOut -> {
                                        busy = false
                                        error = "Too many attempts -- try again shortly."
                                        step = ChangePinStep.EnterCurrent
                                    }
                                    is ChangePinResult.Failed -> {
                                        busy = false
                                        error = result.reason
                                    }
                                }
                            }
                        }
                    },
                ) { Text(if (onCurrentStep) "Continue" else "Change PIN") }
            },
            dismissButton = {
                TextButton(onClick = { if (!busy) open = false }) { Text("Cancel") }
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Biometric
// ---------------------------------------------------------------------------

@Composable
private fun BiometricRow(repository: VaultRepository, configured: Boolean, onChanged: () -> Unit) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column {
        TallyListRow(
            title = "Fingerprint unlock",
            subtitle = when {
                activity == null -> "Not available here."
                configured -> "On -- unlocks Tally with your fingerprint as well as your PIN."
                else -> "Off -- PIN only."
            },
            trailing = {
                Switch(
                    checked = configured,
                    enabled = activity != null && !busy,
                    onCheckedChange = { checked ->
                        if (activity != null) {
                            busy = true
                            error = null
                            scope.launch {
                                if (checked) {
                                    val ok = repository.enableBiometric(activity, ContextCompat.getMainExecutor(context))
                                    if (!ok) {
                                        error = "Couldn't turn on fingerprint unlock -- make sure a fingerprint is enrolled in your phone's settings."
                                    }
                                } else {
                                    repository.disableBiometric()
                                }
                                busy = false
                                onChanged()
                            }
                        }
                    },
                    modifier = Modifier.semantics { contentDescription = "Fingerprint unlock" },
                )
            },
        )
        if (error != null) {
            Text(
                text = error!!,
                style = MaterialTheme.typography.bodySmall,
                color = TallyColors.Critical,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Auto-lock timeout
// ---------------------------------------------------------------------------

/** `internal`, not `private` -- covered directly by `SettingsScreenLogicTest` (pure Kotlin, no Compose/Android involved). */
internal val AUTO_LOCK_OPTIONS: List<Pair<String, Long>> = listOf(
    "30 seconds" to 30_000L,
    "1 minute" to 60_000L,
    "2 minutes" to 120_000L,
    "5 minutes" to 300_000L,
    "10 minutes" to 600_000L,
)

internal fun autoLockLabel(ms: Long): String = AUTO_LOCK_OPTIONS.find { it.second == ms }?.first ?: "2 minutes"

@Composable
private fun AutoLockRow(repository: VaultRepository, currentMs: Long, onChanged: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    TallyListRow(
        title = "Auto-lock",
        subtitle = "Locks Tally after ${autoLockLabel(currentMs)} away from the app.",
        chevron = true,
        onClick = { open = true },
    )

    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("Auto-lock after") },
            text = {
                Column {
                    AUTO_LOCK_OPTIONS.forEachIndexed { index, (label, ms) ->
                        if (index > 0) TallyDivider()
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .a11yRow(description = label) {
                                    open = false
                                    scope.launch {
                                        repository.updateSettings { it.copy(lockTimeoutMs = ms) }
                                        onChanged()
                                    }
                                }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(text = label, color = TallyColors.Ink1, modifier = Modifier.weight(1f))
                            if (ms == currentMs) {
                                Text(text = "Current", color = TallyColors.Accent, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { open = false }) { Text("Close") }
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Notification access
// ---------------------------------------------------------------------------

@Composable
private fun NotificationAccessRow() {
    val context = LocalContext.current
    val granted = NotificationAccessStatus.isGranted(context)

    TallyListRow(
        title = "Notification access",
        subtitle = if (granted) {
            "On -- Tally can read payment notifications to capture spending automatically."
        } else {
            "Off. Android doesn't let an app turn this on for itself -- it opens the system settings screen instead."
        },
        chevron = true,
        onClick = { context.startActivity(NotificationAccessStatus.settingsIntent()) },
    )
}

// ---------------------------------------------------------------------------
// Erase everything
// ---------------------------------------------------------------------------

private const val ERASE_CONFIRM_WORD = "ERASE"

@Composable
private fun EraseRow(repository: VaultRepository, onErased: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    var typed by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    TallyListRow(
        title = "Erase everything",
        subtitle = "Deletes every transaction, category, budget, recurring series and your PIN from this device. Cannot be undone.",
        onClick = { typed = ""; open = true },
    )

    if (open) {
        AlertDialog(
            onDismissRequest = { if (!busy) open = false },
            title = { Text("Erase everything?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "This deletes everything stored on this device. There is no undo, and no " +
                            "second confirmation after this one. Back up first if you haven't recently.",
                    )
                    Text(text = "Type $ERASE_CONFIRM_WORD to confirm.", style = MaterialTheme.typography.labelLarge)
                    OutlinedTextField(
                        value = typed,
                        onValueChange = { typed = it },
                        singleLine = true,
                        enabled = !busy,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        busy = true
                        scope.launch {
                            repository.resetAll()
                            busy = false
                            open = false
                            onErased()
                        }
                    },
                    enabled = typed == ERASE_CONFIRM_WORD && !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = TallyColors.Critical, contentColor = TallyColors.InkOnAccent),
                ) { Text("Erase everything") }
            },
            dismissButton = {
                TextButton(onClick = { if (!busy) open = false }) { Text("Cancel") }
            },
        )
    }
}
