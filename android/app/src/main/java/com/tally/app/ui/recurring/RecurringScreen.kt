package com.tally.app.ui.recurring

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.money.RecurringCadence
import com.tally.app.money.RecurringSeries
import com.tally.app.money.isBillSeries
import com.tally.app.recurring.monthlyEquivalentCents
import com.tally.app.recurring.priceIncreases
import com.tally.app.ui.components.GlyphBadge
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyEmptyState
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.formatRelativeDay
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType

/**
 * Regular payments — the detected recurring series (subscriptions and bills;
 * Menu's "Regular payments" row, DESIGN-V4.md §2).
 *
 * [series] is whatever list the caller loaded (the vault's stored recurring
 * series, refreshed by `com.tally.app.recurring.detectRecurring` upstream —
 * this screen only displays and lets the user act on it, it never runs
 * detection or invents a series of its own). Every per-row figure comes from
 * `com.tally.app.recurring.monthlyEquivalentCents` and
 * `com.tally.app.money.isBillSeries` — the SAME single definitions
 * `computeMonthMoney` itself uses for the equation's "Bills" line
 * (docs/AGENT-BRIEF.md §3) — never a second, locally-reimplemented version of
 * either. No total is summed across series on this screen: a "total monthly
 * cost of everything shown here" would count unconfirmed weekly/fortnightly
 * habits that `isBillSeries` deliberately excludes from Bills, and showing it
 * next to Home's real Bills figure is exactly the kind of second number that
 * could disagree with the first (DESIGN-V4.md §1's rule) — so it is left out
 * rather than invented.
 *
 * Confirming or muting a series updates [RecurringSeries.confirmed] /
 * [RecurringSeries.muted] via [onConfirm]/[onToggleMuted] — the caller is
 * expected to persist the change through `VaultRepository.setRecurring`
 * (the task brief), keeping this screen decoupled from the vault itself.
 */
@Composable
fun RecurringScreen(
    series: List<RecurringSeries>,
    onConfirm: (RecurringSeries) -> Unit,
    onToggleMuted: (RecurringSeries) -> Unit,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    val increases = remember(series) { priceIncreases(series) }
    val ordered = remember(series) { sortSeriesForDisplay(series) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        BackHeader(onBack = onBack)

        Text(
            text = "Regular payments",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )
        Text(
            text = "Subscriptions and bills Tally has noticed repeating. Confirm the ones that are real " +
                "commitments; mute anything that isn't.",
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink2,
        )

        if (increases.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TallySectionLabel("Price rises")
                TallyListGroup {
                    increases.forEachIndexed { index, item ->
                        if (index > 0) TallyDivider()
                        PriceIncreaseRow(item)
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TallySectionLabel("All regular payments")
            if (ordered.isEmpty()) {
                TallyListGroup {
                    TallyEmptyState(
                        headline = "Nothing detected yet",
                        body = "As you log and import more spending, Tally will notice things that repeat " +
                            "— rent, subscriptions, bills — and list them here.",
                    )
                }
            } else {
                TallyListGroup {
                    ordered.forEachIndexed { index, item ->
                        if (index > 0) TallyDivider()
                        SeriesRow(
                            series = item,
                            onConfirm = { onConfirm(item) },
                            onToggleMuted = { onToggleMuted(item) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BackHeader(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .a11yRow(description = "Back", onClick = onBack),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TallyIcons.ChevronLeft(modifier = Modifier.size(20.dp))
        Text(text = "Back", style = MaterialTheme.typography.labelLarge, color = TallyColors.Ink2)
    }
}

@Composable
private fun PriceIncreaseRow(series: RecurringSeries) {
    val rise = series.priceIncreaseCents ?: 0L
    val baseline = series.amountCents - rise
    TallyListRow(
        title = series.merchant,
        subtitle = "Was ${formatMoney(baseline)}, now ${formatMoney(series.amountCents)}",
        leading = { GlyphBadge(glyph = "!", tint = TallyColors.Caution, background = TallyColors.CautionTint) },
        trailing = { MoneyText(cents = rise, showSign = true, color = TallyColors.Caution) },
    )
}

@Composable
private fun SeriesRow(series: RecurringSeries, onConfirm: () -> Unit, onToggleMuted: () -> Unit) {
    val muted = series.muted
    val titleColor = if (muted) TallyColors.Ink3 else TallyColors.Ink1
    val supportColor = TallyColors.Ink3

    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GlyphBadge(
                    glyph = cadenceGlyph(series.cadence),
                    tint = if (muted) TallyColors.Ink3 else TallyColors.Ink2,
                )
                Column {
                    Text(text = series.merchant, style = MaterialTheme.typography.bodyLarge, color = titleColor)
                    Text(
                        text = "${cadenceLabel(series.cadence)} · next due ${formatRelativeDay(series.nextDue)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = supportColor,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                MoneyText(cents = monthlyEquivalentCents(series), color = if (muted) TallyColors.Ink3 else TallyColors.Ink1)
                Text(text = "a month", style = MaterialTheme.typography.labelMedium, color = TallyColors.Ink3)
            }
        }

        Text(
            text = if (muted) "Muted — not counted here." else billStatusLabel(series),
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink3,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, alignment = Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (muted) {
                TextButton(onClick = onToggleMuted, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = "Unmute", color = TallyColors.Accent)
                }
            } else {
                TextButton(onClick = onToggleMuted, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = "Mute", color = TallyColors.Ink2)
                }
                if (series.confirmed) {
                    Text(
                        text = "Confirmed",
                        style = MaterialTheme.typography.labelLarge,
                        color = TallyColors.Accent,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                } else {
                    TextButton(onClick = onConfirm, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = "Confirm", color = TallyColors.AccentPress)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pure helpers — no Compose dependency, unit-testable directly.
// ---------------------------------------------------------------------------

internal fun cadenceLabel(cadence: RecurringCadence): String = when (cadence) {
    RecurringCadence.WEEKLY -> "Weekly"
    RecurringCadence.FORTNIGHTLY -> "Fortnightly"
    RecurringCadence.MONTHLY -> "Monthly"
    RecurringCadence.QUARTERLY -> "Quarterly"
    RecurringCadence.YEARLY -> "Yearly"
}

internal fun cadenceGlyph(cadence: RecurringCadence): String = when (cadence) {
    RecurringCadence.WEEKLY -> "W"
    RecurringCadence.FORTNIGHTLY -> "F"
    RecurringCadence.MONTHLY -> "M"
    RecurringCadence.QUARTERLY -> "Q"
    RecurringCadence.YEARLY -> "Y"
}

/** Reuses [isBillSeries] — the single definition also behind Home's "Bills" line
 *  — never a locally-reimplemented rule about what counts as committed. */
internal fun billStatusLabel(series: RecurringSeries): String =
    if (isBillSeries(series)) "Counted in Bills on Home." else "Counted as ordinary spending until confirmed."

/** Active series soonest-due first, with muted series sunk to the bottom
 *  (still visible and reachable to unmute, just out of the way — never
 *  hidden entirely, since a muted series is a real user decision, not
 *  nothing to report). */
internal fun sortSeriesForDisplay(series: List<RecurringSeries>): List<RecurringSeries> {
    val active = series.filterNot { it.muted }.sortedBy { it.nextDue }
    val muted = series.filter { it.muted }.sortedBy { it.merchant.lowercase() }
    return active + muted
}
