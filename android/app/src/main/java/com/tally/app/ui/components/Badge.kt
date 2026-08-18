package com.tally.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tally.app.ui.theme.TallyColors

/**
 * A round icon well — used for "Bills due soon", "Deposit plan" and "To
 * sort out" row leadings. This app draws no per-feature icon set; a short
 * glyph (a letter or symbol) on a tinted circle carries the same "what kind
 * of row is this" signal the web app's `lucide-react` icons do, without a
 * second icon dependency.
 */
@Composable
fun GlyphBadge(
    glyph: String,
    modifier: Modifier = Modifier,
    background: Color = TallyColors.SurfaceSunk,
    tint: Color = TallyColors.Ink2,
    size: Dp = 36.dp,
) {
    Box(
        modifier = modifier
            .size(size)
            .background(background, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = glyph, color = tint, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
    }
}

/**
 * A category's icon well: its ramp colour as a soft tint behind the
 * category's initial letter — the category ramp "doing the expressive
 * work" (DESIGN-V3.md §1) without a per-category icon lookup table.
 *
 * The letter itself is drawn in [TallyColors.Ink1], not the ramp colour, per
 * DESIGN-V3.md §1: "pair with --ink-1 when used as a tint behind an icon."
 * Measured: every ramp colour drawn as 15/17sp text tops out around 4.0:1
 * against white (cat-9, the best case) and drops to ~3.1:1 once it's the
 * *text* on its own 16%-alpha tint well — below the 4.5:1 normal-text floor
 * for all twelve hues. Ink1 on the same tint wells measures >=14.6:1.
 */
@Composable
fun CategoryBadge(colorIndex: Int, label: String, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val color = TallyColors.categoryColor(colorIndex)
    Box(
        modifier = modifier
            .size(size)
            .background(color.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label.take(1).uppercase(),
            color = TallyColors.Ink1,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
