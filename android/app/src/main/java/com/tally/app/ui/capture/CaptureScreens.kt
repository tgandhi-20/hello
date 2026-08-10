package com.tally.app.ui.capture

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.capture.permission.NotificationAccessOnboardingScreen
import com.tally.app.capture.permission.NotificationAccessStatus
import com.tally.app.capture.review.CaptureReviewQueueImpl
import com.tally.app.capture.review.CaptureReviewScreen
import com.tally.app.capture.store.SecureCaptureStorage
import com.tally.app.data.VaultRepository
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType

/**
 * Shared back header for both routes below -- an icon back button plus a
 * title, matching `ui/csvimport/CsvImportScreen.kt`'s `ImportHeader` shape so
 * a screen reached from Menu doesn't read as a different app mid-navigation.
 */
@Composable
private fun CaptureRouteHeader(title: String) {
    Text(
        text = title,
        style = TallyType.Title,
        color = TallyColors.Ink1,
        modifier = Modifier.semantics(mergeDescendants = false) { heading() },
    )
}

@Composable
private fun BackButton(onBack: () -> Unit) {
    Box(
        modifier = Modifier.size(48.dp).a11yRow(description = "Back", onClick = onBack),
        contentAlignment = Alignment.Center,
    ) {
        TallyIcons.ChevronLeft(modifier = Modifier.size(22.dp))
    }
}

/**
 * The capture review queue, fully wired to the real vault -- this is Build
 * 1's vault bridge made visible. Constructs a [SecureCaptureStorage] buffer
 * and a [VaultCaptureBridge] (this package) over [repository], and renders
 * `capture.review.CaptureReviewScreen` (owned by the capture module, used
 * as-is and not restyled here) underneath a plain back header.
 *
 * Nothing is added to the ledger until the user accepts an item, one at a
 * time or all at once -- `CaptureReviewScreen`'s own copy says so directly,
 * and nothing in this wrapper changes that. A wallet-tap item (no known
 * card) cannot be accepted from that screen without one, since its Accept
 * button stays disabled until an account is known -- see this file's own
 * top-level doc/report note on the one gap that leaves: there is currently
 * no picker in `CaptureReviewScreen` for choosing which card a wallet tap
 * used, since that screen lives under `capture/` and is out of this task's
 * ownership to change.
 */
@Composable
fun CaptureReviewRoute(repository: VaultRepository, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val queue = remember(repository) {
        val buffer = SecureCaptureStorage(context)
        val bridge = VaultCaptureBridge(repository)
        CaptureReviewQueueImpl(
            buffer = buffer,
            ledgerHashLookup = bridge,
            writer = bridge,
            notificationAccessGranted = { NotificationAccessStatus.isGranted(context) },
        )
    }

    Column(modifier = modifier.fillMaxSize().background(TallyColors.Ground)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(start = 8.dp, top = 20.dp, bottom = 4.dp),
        ) {
            BackButton(onBack)
            CaptureRouteHeader("Captured spending")
        }
        CaptureReviewScreen(queue = queue, modifier = Modifier.fillMaxSize())
    }
}

/**
 * Notification-listener onboarding, wrapped with a back header for routing.
 * `capture.permission.NotificationAccessOnboardingScreen` already carries
 * the full honest copy -- what gets captured, what does not, and that this
 * never makes the ledger complete on its own -- unchanged here.
 */
@Composable
fun NotificationAccessRoute(onBack: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxSize().background(TallyColors.Ground)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(start = 8.dp, top = 20.dp, bottom = 4.dp),
        ) {
            BackButton(onBack)
            CaptureRouteHeader("Notification access")
        }
        NotificationAccessOnboardingScreen(modifier = Modifier.fillMaxSize())
    }
}
