package com.tally.app.ui.capture

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.tally.app.capture.permission.NotificationAccessOnboardingScreen
import com.tally.app.capture.permission.NotificationAccessStatus
import com.tally.app.capture.review.CaptureReviewQueueImpl
import com.tally.app.capture.review.CaptureReviewScreen
import com.tally.app.capture.store.SecureCaptureStorage
import com.tally.app.data.VaultRepository
import com.tally.app.ui.components.TallyBackHeader
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType

/**
 * Shared header for both routes below -- the app-wide [TallyBackHeader] plus
 * a title, matching every other pushed screen's back affordance and title
 * treatment so a screen reached from Menu doesn't read as a different app
 * mid-navigation.
 */
@Composable
private fun CaptureRouteHeader(title: String, onBack: () -> Unit) {
    Column(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TallyBackHeader(onBack = onBack)
        Text(
            text = title,
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )
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
 * card) cannot be accepted from that screen without one, but this is no
 * longer a dead end: `CaptureReviewScreen` itself has a "Choose card" picker
 * for exactly that row, listing every real account from `AccountIds` and
 * writing the item once one is tapped (see that file's own "The account
 * picker" doc comment) -- the row is never stuck with a permanently disabled
 * Accept button and no way to answer it.
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
        CaptureRouteHeader("Captured spending", onBack = onBack)
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
        CaptureRouteHeader("Notification access", onBack = onBack)
        NotificationAccessOnboardingScreen(modifier = Modifier.fillMaxSize())
    }
}
