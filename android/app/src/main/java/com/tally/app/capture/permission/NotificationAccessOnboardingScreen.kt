package com.tally.app.capture.permission

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Honest onboarding for notification-listener access. Says plainly what gets
 * captured, what does not, and that nothing here makes the ledger complete on
 * its own -- the same rule ANDROID.md §2 and CONTRACTS.md apply to every
 * other screen in this app applies here too: no copy that implies otherwise.
 *
 * Re-checks grant status via the "check again" button rather than an
 * automatic on-resume observer: this keeps the screen's imports to
 * `compose.runtime`/`compose.ui` only, both already proven to compile in
 * `MainActivity.kt`, instead of reaching for a lifecycle-aware Compose API
 * this module cannot verify resolves cleanly against this exact Compose
 * BOM/Kotlin pairing without a working local build. Whoever mounts this
 * screen for real is free to wire an automatic re-check on resume if their
 * existing screens already have a proven pattern for it.
 */
@Composable
fun NotificationAccessOnboardingScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(NotificationAccessStatus.isGranted(context)) }

    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            "Capture transactions automatically",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (granted) "On" else "Off", fontWeight = FontWeight.SemiBold)
            Text(
                if (granted) "Tally can read payment notifications." else "Tally is not reading notifications yet.",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Text(
            "When this is on, Tally reads notifications from CommBank, Bankwest, Amex, " +
                "Google Wallet and Samsung Wallet as they arrive, and pulls out the amount " +
                "and merchant so you don't have to type it in. Nothing is added to your " +
                "ledger straight away -- everything captured waits in a review list until " +
                "you accept it, one at a time or all at once.",
            style = MaterialTheme.typography.bodyMedium
        )

        Text("What this can't capture", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            "A card typed into a website, or one saved on file somewhere, doesn't come " +
                "through here. Neither do direct debits and scheduled payments that post " +
                "quietly, or anything from a bank app with notifications turned off. And a " +
                "notification that doesn't clearly state an amount and a merchant gets " +
                "skipped rather than guessed at.",
            style = MaterialTheme.typography.bodyMedium
        )

        Text(
            "CSV import stays the real record for that reason -- this just cuts down on " +
                "typing for the purchases your bank actually tells your phone about.",
            style = MaterialTheme.typography.bodyMedium
        )

        Button(onClick = { context.startActivity(NotificationAccessStatus.settingsIntent()) }) {
            Text(if (granted) "Open notification access settings" else "Turn on notification access")
        }

        OutlinedButton(onClick = { granted = NotificationAccessStatus.isGranted(context) }) {
            Text("I've changed it -- check again")
        }
    }
}
