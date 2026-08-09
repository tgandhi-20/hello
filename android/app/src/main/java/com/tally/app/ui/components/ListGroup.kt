package com.tally.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyPillRadius

/**
 * The grouped-list container (DESIGN-V3.md §3): one white rounded card
 * holding rows separated by hairlines, never one card per row.
 */
@Composable
fun TallyListGroup(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TallyCardRadius),
        colors = CardDefaults.cardColors(containerColor = TallyColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column { content() }
    }
}

/** A single 1dp hairline divider — deliberately hand-drawn (Box + background)
 *  rather than a Material `Divider`/`HorizontalDivider`, whose exact name
 *  changed between Material3 versions; this is unambiguous on every version. */
@Composable
fun TallyDivider(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(TallyColors.Hairline)
    )
}

/**
 * One row inside a [TallyListGroup]. Min-height 56dp (DESIGN-V3.md §3).
 * When [onClick] is set the whole row is one TalkBack-focusable unit — its
 * title/subtitle text already gives it an accessible name, so no separate
 * `contentDescription` is needed for a row that has visible text.
 */
@Composable
fun TallyListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    chevron: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val rowModifier = if (onClick != null) modifier.a11yRow(onClick = onClick) else modifier
    Row(
        modifier = rowModifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leading?.invoke()
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
            if (subtitle != null) {
                Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink2)
            }
        }
        trailing?.invoke()
        if (chevron) {
            TallyIcons.ChevronRight(modifier = Modifier.defaultMinSize(minWidth = 16.dp, minHeight = 16.dp))
        }
    }
}

/** A small pill-shaped tag — used for the "we think" / relative-date chips. */
@Composable
fun TallyChip(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(TallyColors.SurfaceSunk, RoundedCornerShape(TallyPillRadius))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = MaterialTheme.typography.labelMedium, color = TallyColors.Ink2)
    }
}

/** Section eyebrow label above a [TallyListGroup] ("Money", "Where it went", …). */
@Composable
fun TallySectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = TallyColors.Ink2,
        modifier = modifier.padding(horizontal = 4.dp, vertical = 4.dp),
    )
}
