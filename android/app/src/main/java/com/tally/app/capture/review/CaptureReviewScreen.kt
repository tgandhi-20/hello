package com.tally.app.capture.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tally.app.capture.model.AccountIds
import com.tally.app.capture.model.PendingCapture
import kotlinx.coroutines.launch

/**
 * A ready-made Compose surface for [CaptureReviewQueue] -- pass an instance
 * in, mount it anywhere. Deliberately self-contained: it renders with plain
 * Material3 components only, nothing from `ui/` (which is another agent's to
 * build), so it has nothing to wait on to compile. Whoever owns the app's
 * screens is free to use this as-is, restyle it, or build their own against
 * [CaptureReviewQueue] directly -- the interface, not this file, is the
 * actual contract. Because the whole app renders under `ui.theme.TallyTheme`
 * (see `MainActivity.kt`), the `MaterialTheme.colorScheme`/`typography`
 * values reached for below already ARE the Tally design tokens -- this file
 * never hardcodes a colour or a type size of its own.
 *
 * Money is formatted here with a small local helper rather than a shared
 * formatter, for the same "don't block on a file I don't own" reason -- swap
 * it for `money/`'s real formatter once that exists.
 *
 * ## The account picker
 *
 * [PendingCapture.account] is `null` exactly for wallet taps (Google
 * Wallet / Samsung Wallet), which never say which underlying card was used.
 * `CaptureReviewQueue.accept` refuses to guess -- it returns
 * [CaptureOutcome.NeedsAccount] unless the caller supplies `chosenAccount`.
 * Each such row here shows a "Choose card" affordance instead of a
 * permanently-disabled Accept button; tapping it reveals one button per real
 * account (from [AccountIds] -- never a hardcoded id), and picking one is
 * itself the accept ([CaptureReviewQueue.accept] with that id). Nothing is
 * pre-selected and no choice is remembered for the next item -- every wallet
 * tap gets its own explicit tap, on purpose (see [ACCOUNT_CHOICES]'s doc
 * comment and ANDROID.md's "refusing to guess" reasoning).
 */
@Composable
fun CaptureReviewScreen(queue: CaptureReviewQueue, modifier: Modifier = Modifier) {
    val state by queue.state.collectAsState()
    val scope = rememberCoroutineScope()

    // Which account-less rows currently have their card picker open. Never
    // pre-populated and never carries a "last used" value between items --
    // each row starts collapsed, every time.
    var expandedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    // Per-item reason a write failed, so the row itself can say so while it
    // stays pending (the queue never removes a Failed item from the buffer).
    var failedReasons by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    // A single transient line for outcomes that make a row disappear (already
    // in the ledger, or a bulk accept's summary), so the reason isn't lost
    // along with the row.
    var banner by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(queue) { queue.refresh() }

    fun applyOutcome(outcome: CaptureOutcome) {
        when (outcome) {
            is CaptureOutcome.Written -> {
                failedReasons = failedReasons - outcome.capture.id
                expandedIds = expandedIds - outcome.capture.id
            }
            is CaptureOutcome.AlreadyInLedger -> {
                failedReasons = failedReasons - outcome.capture.id
                expandedIds = expandedIds - outcome.capture.id
                banner = "${outcome.capture.merchant} (${formatCents(outcome.capture.amountCents)}) " +
                    "was already in your ledger -- not added twice."
            }
            is CaptureOutcome.Failed -> {
                failedReasons = failedReasons + (outcome.capture.id to outcome.reason)
            }
            is CaptureOutcome.NeedsAccount -> {
                // This screen never calls accept() for a null-account item
                // without a chosenAccount, so this should not happen from
                // here -- the row's own "Choose card" affordance already
                // covers it if it somehow does.
            }
            CaptureOutcome.NotFound -> {
                banner = "That item was already handled elsewhere -- nothing to do."
            }
        }
    }

    fun accept(id: String) {
        scope.launch { applyOutcome(queue.accept(id)) }
    }

    fun chooseAccount(id: String, accountId: String) {
        scope.launch { applyOutcome(queue.accept(id, chosenAccount = accountId)) }
    }

    fun acceptAll() {
        scope.launch {
            val outcomes = queue.acceptAll()
            val failed = outcomes.filterIsInstance<CaptureOutcome.Failed>()
            if (failed.isNotEmpty()) {
                failedReasons = failedReasons + failed.associate { it.capture.id to it.reason }
            }
            val alreadyCount = outcomes.count { it is CaptureOutcome.AlreadyInLedger }
            val notFoundCount = outcomes.count { it is CaptureOutcome.NotFound }
            val parts = mutableListOf<String>()
            if (alreadyCount > 0) {
                parts += "$alreadyCount already in your ledger, not added twice"
            }
            if (failed.isNotEmpty()) {
                val n = failed.size
                parts += "$n couldn't be written and ${if (n == 1) "is" else "are"} still pending"
            }
            if (notFoundCount > 0) {
                parts += "$notFoundCount no longer waiting"
            }
            banner = if (parts.isEmpty()) null else parts.joinToString(". ") + "."
        }
    }

    Column(modifier = modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Captured, waiting for you", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

        Text(
            "This only sees what your bank or wallet actually posts as a notification. A " +
                "card typed into a website, one saved on file, a direct debit, or anything " +
                "from an app with notifications off won't show up here -- CSV import stays " +
                "the real record.",
            style = MaterialTheme.typography.bodySmall
        )

        if (!state.notificationAccessGranted) {
            Text(
                "Notification access is off, so nothing is being captured right now.",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        if (banner != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(banner ?: "", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                TextButton(onClick = { banner = null }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text("Dismiss")
                }
            }
        }

        if (state.pending.isEmpty()) {
            Text("Nothing waiting right now.", style = MaterialTheme.typography.bodyMedium)
        } else {
            val acceptableCount = state.pending.count { it.account != null }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { acceptAll() },
                    enabled = acceptableCount > 0,
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text(
                        if (acceptableCount == state.pending.size) {
                            "Accept all (${state.pending.size})"
                        } else {
                            "Accept $acceptableCount with a known card"
                        }
                    )
                }
                OutlinedButton(
                    onClick = { scope.launch { queue.dismissAll(state.pending.map { it.id }) } },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text("Dismiss all")
                }
            }

            LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(items = state.pending, key = { it.id }) { item ->
                    PendingCaptureRow(
                        item = item,
                        expanded = item.id in expandedIds,
                        failedReason = failedReasons[item.id],
                        onToggleChooseAccount = {
                            expandedIds = if (item.id in expandedIds) {
                                expandedIds - item.id
                            } else {
                                expandedIds + item.id
                            }
                        },
                        onChooseAccount = { accountId -> chooseAccount(item.id, accountId) },
                        onAccept = { accept(item.id) },
                        onDismiss = { scope.launch { queue.dismiss(item.id) } }
                    )
                }
            }
        }

        if (state.droppedCount > 0) {
            val n = state.droppedCount
            Text(
                "$n notification${if (n == 1) "" else "s"} could not be read clearly and ${if (n == 1) "was" else "were"} skipped, not guessed.",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

/**
 * The real accounts a wallet tap can be filed against, in a fixed display
 * order -- ids straight from [AccountIds], never a hardcoded string. `cash`
 * is deliberately absent: [AccountIds] itself omits it, "nothing this module
 * captures can plausibly be a cash transaction" (see that file's doc
 * comment), and that reasoning applies just as much to a wallet tap as it
 * does to a bank notification -- a phone tap is never a cash purchase.
 */
private val ACCOUNT_CHOICES: List<Pair<String, String>> = listOf(
    AccountIds.CBA to "CBA",
    AccountIds.CBA_CARD to "CBA card",
    AccountIds.BANKWEST to "Bankwest",
    AccountIds.AMEX to "Amex",
)

@Composable
private fun PendingCaptureRow(
    item: PendingCapture,
    expanded: Boolean,
    failedReason: String?,
    onToggleChooseAccount: () -> Unit,
    onChooseAccount: (String) -> Unit,
    onAccept: () -> Unit,
    onDismiss: () -> Unit
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(formatCents(item.amountCents), style = MaterialTheme.typography.titleMedium)
            Text(item.merchant, style = MaterialTheme.typography.bodyLarge)
            Text(item.rawText, style = MaterialTheme.typography.bodySmall)

            if (failedReason != null) {
                Text(
                    "Didn't write: $failedReason. Still pending -- nothing lost.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            if (item.account == null) {
                Text(
                    "Wallet taps don't say which card was used. Choose one before this can be added.",
                    style = MaterialTheme.typography.bodySmall
                )
                if (expanded) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        ACCOUNT_CHOICES.forEach { (accountId, label) ->
                            OutlinedButton(
                                onClick = { onChooseAccount(accountId) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            ) {
                                Text(label)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = onToggleChooseAccount, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text("Cancel")
                            }
                            OutlinedButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text("Dismiss")
                            }
                        }
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onToggleChooseAccount, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text("Choose card")
                        }
                        OutlinedButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text("Dismiss")
                        }
                    }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onAccept, modifier = Modifier.heightIn(min = 48.dp)) { Text("Accept") }
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Dismiss") }
                }
            }
        }
    }
}

/** `amountCents` -> `"$12.30"` / `"-$12.30"`. Local placeholder -- see file doc comment. */
private fun formatCents(amountCents: Long): String {
    val sign = if (amountCents < 0) "-" else ""
    val abs = kotlin.math.abs(amountCents)
    val dollars = abs / 100
    val cents = (abs % 100).toString().padStart(2, '0')
    return "$sign\$$dollars.$cents"
}
