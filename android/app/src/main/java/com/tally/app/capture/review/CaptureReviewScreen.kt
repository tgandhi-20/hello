package com.tally.app.capture.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tally.app.capture.model.PendingCapture
import kotlinx.coroutines.launch

/**
 * A ready-made Compose surface for [CaptureReviewQueue] -- pass an instance
 * in, mount it anywhere. Deliberately self-contained: it renders with plain
 * Material3 components only, nothing from `ui/` (which does not exist yet
 * in this native app and is another agent's to build), so it has nothing to
 * wait on to compile. Whoever owns the app's screens is free to use this
 * as-is, restyle it, or build their own against [CaptureReviewQueue] directly
 * -- the interface, not this file, is the actual contract.
 *
 * Money is formatted here with a small local helper rather than a shared
 * formatter, for the same "don't block on a file I don't own" reason -- swap
 * it for `money/`'s real formatter once that exists.
 */
@Composable
fun CaptureReviewScreen(queue: CaptureReviewQueue, modifier: Modifier = Modifier) {
    val state by queue.state.collectAsState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(queue) { queue.refresh() }

    Column(modifier = modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Captured, waiting for you", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

        if (!state.notificationAccessGranted) {
            Text(
                "Notification access is off, so nothing is being captured right now.",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        if (state.pending.isEmpty()) {
            Text("Nothing waiting right now.", style = MaterialTheme.typography.bodyMedium)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { scope.launch { queue.acceptAll() } }) {
                    Text("Accept all (${state.pending.size})")
                }
                OutlinedButton(onClick = { scope.launch { queue.dismissAll(state.pending.map { it.id }) } }) {
                    Text("Dismiss all")
                }
            }

            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(items = state.pending, key = { it.id }) { item ->
                    PendingCaptureRow(
                        item = item,
                        onAccept = { scope.launch { queue.accept(item.id) } },
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

@Composable
private fun PendingCaptureRow(item: PendingCapture, onAccept: () -> Unit, onDismiss: () -> Unit) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(formatCents(item.amountCents), style = MaterialTheme.typography.titleMedium)
            Text(item.merchant, style = MaterialTheme.typography.bodyLarge)
            if (item.account == null) {
                Text("Which card was this? Pick one before accepting.", style = MaterialTheme.typography.bodySmall)
            }
            Text(item.rawText, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAccept, enabled = item.account != null) { Text("Accept") }
                OutlinedButton(onClick = onDismiss) { Text("Dismiss") }
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
