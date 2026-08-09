package com.tally.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Type scale — DESIGN-V3.md §2: 12 / 13 / 15 / 17 / 20 / 28 / 40, body 15,
 * system font (this maps to Roboto on the target device, matching the
 * spec's deliberate choice of "the Google-app typeface" rather than a
 * bundled webfont).
 *
 * Named individually (not just folded into Material3's Typography slots)
 * so call sites can reach for "the 17px scale step" by name rather than by
 * guessing which Material3 role happens to carry it.
 */
object TallyType {
    val Caption = TextStyle(fontSize = 12.sp, lineHeight = 16.sp) // 2xs
    val Label = TextStyle(fontSize = 13.sp, lineHeight = 18.sp) // xs
    val Body = TextStyle(fontSize = 15.sp, lineHeight = 22.sp) // sm — body
    val BodyLarge = TextStyle(fontSize = 17.sp, lineHeight = 24.sp) // md
    val Title = TextStyle(fontSize = 20.sp, lineHeight = 26.sp) // lg
    val Headline = TextStyle(fontSize = 28.sp, lineHeight = 34.sp) // xl
    val Display = TextStyle(fontSize = 40.sp, lineHeight = 44.sp) // 2xl

    /**
     * Money style — DESIGN-V3.md §2's `.money`: tabular figures, weight 600,
     * slight negative tracking. Every amount in the app is rendered through
     * this style (or [MoneyHero]) — never a bare Text with ad hoc styling.
     */
    val Money = TextStyle(
        fontWeight = FontWeight.SemiBold, // 600
        fontFeatureSettings = "tnum",
        letterSpacing = (-0.01).em,
        textAlign = TextAlign.End,
    )

    /** `.money-hero` — the equation's headline "Left" figure. 40px/700/tabular/-0.02em. */
    val MoneyHero = TextStyle(
        fontSize = 40.sp,
        lineHeight = 44.sp,
        fontWeight = FontWeight.Bold,
        fontFeatureSettings = "tnum",
        letterSpacing = (-0.02).em,
    )
}

/**
 * Material3 [Typography] built from the same scale, so any stock M3
 * component (Snackbar text, NavigationBarItem label) inherits the right
 * sizes automatically instead of falling back to Material's default scale.
 */
val TallyTypography = Typography(
    displayLarge = TallyType.Display,
    displayMedium = TallyType.Display,
    displaySmall = TallyType.Headline,
    headlineLarge = TallyType.Headline,
    headlineMedium = TallyType.Headline,
    headlineSmall = TallyType.Title,
    titleLarge = TallyType.Title,
    titleMedium = TallyType.BodyLarge.copy(fontWeight = FontWeight.SemiBold),
    titleSmall = TallyType.Body.copy(fontWeight = FontWeight.SemiBold),
    bodyLarge = TallyType.BodyLarge,
    bodyMedium = TallyType.Body,
    bodySmall = TallyType.Label,
    labelLarge = TallyType.Body.copy(fontWeight = FontWeight.Medium),
    labelMedium = TallyType.Label.copy(fontWeight = FontWeight.Medium),
    labelSmall = TallyType.Caption.copy(fontWeight = FontWeight.Medium),
)
