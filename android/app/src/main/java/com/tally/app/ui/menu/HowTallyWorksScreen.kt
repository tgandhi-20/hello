package com.tally.app.ui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.TallyBackHeader
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType

/**
 * "How Tally works" — Menu's App section (docs/DESIGN-V4.md section 4.3):
 * "half a screen, plain English, the equation, and what the app can and
 * cannot see... No jargon, no feature tour." Currently reached through
 * `ui/menu`'s generic `PlaceholderScreen`, which is honest but says nothing
 * — DESIGN-V4 asks for this page to actually exist, not just be reachable.
 *
 * Deliberately static: every other screen in this app reads a live figure
 * from `TallyDataSource`, but this one explains the MODEL, not today's
 * numbers, so it takes no data source and can never show a number that
 * drifts from what Home/Spend/Budgets actually display. If this page ever
 * needs a live figure, that figure belongs on Home instead — see
 * docs/DESIGN-V4.md section 1's "if two numbers on screen could ever
 * disagree, one of them must go."
 *
 * Not yet wired into `ui/nav/Route.kt` / `ui/menu/MenuScreen.kt` — both are
 * orchestrator-owned (docs/AGENT-BRIEF.md section 6). Signature reported for
 * the orchestrator to route Menu's "How Tally works" row here in place of
 * its current `Route.Placeholder`.
 */
@Composable
fun HowTallyWorksScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
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
            text = "How Tally works",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )

        ExplainerSection(
            heading = "The equation",
            body = "Every figure in Tally comes from one calculation, and it's the same one every " +
                "screen uses:\n\n" +
                "Income − Bills − Savings = To spend\n" +
                "To spend − Already spent = Left\n\n" +
                "\"Left\" spread over the days remaining in the month is what's left today. Nothing " +
                "in Tally is worked out a second, different way — a category total, a card balance " +
                "and the deposit plan are all views of this same calculation, never a separate guess.",
        )

        ExplainerSection(
            heading = "What Tally can see",
            body = "Only what you tell it: what you log with Add, and what you import from a bank " +
                "statement (a CSV file). If notification access is turned on, Tally can also log " +
                "some spending automatically from payment notifications as they arrive.",
        )

        ExplainerSection(
            heading = "What Tally can't see",
            body = "Your real bank balance, right now. Tally has no connection to any bank — every " +
                "account figure it shows is built from what's been logged or imported, as at the " +
                "date next to it, never a live number fetched from your bank.",
        )

        ExplainerSection(
            heading = "About notifications",
            body = "Notification capture is a convenience, not a full record. It misses anything paid " +
                "with a card saved on file, silent direct debits, and any purchase made while " +
                "notifications are off. Importing your bank statement stays the record Tally trusts " +
                "most — the one every other figure ultimately checks itself against.",
        )

        ExplainerSection(
            heading = "Where your data lives",
            body = "On this device only. Tally has no permission to use the internet at all, so " +
                "nothing it can see — a transaction, a balance, your PIN — can leave your phone.",
        )
    }
}

@Composable
private fun ExplainerSection(heading: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel(heading)
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink2,
        )
    }
}
