package com.tally.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Tally design tokens — ported verbatim from docs/DESIGN-V3.md §1 /
 * src/styles/tokens.css. Every colour used anywhere in this app traces back
 * to a value in this file. Never hardcode a hex value in a screen or
 * component file.
 *
 * v3 is light-only by design ("Dark mode is out of scope for v3. Commit to
 * light and paint every colour explicitly.") — this app does not branch on
 * system dark-mode; every screen renders these exact tokens regardless of
 * the phone's theme setting.
 *
 * MEASURED contrast ratios carried over from tokens.css — see that file for
 * the full methodology. ink-3 in particular is #646C77, NOT the #858C95
 * originally drafted in DESIGN-V3.md §1, because the lighter value failed
 * WCAG AA on both surface and ground.
 */
object TallyColors {
    // Ground — white cards lift off a cool, slightly-grey page ground.
    val Ground = Color(0xFFF4F6F8)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceSunk = Color(0xFFEDEFF3)
    val Hairline = Color(0xFFE2E6EB)

    // Ink — near-black, never pure black.
    val Ink1 = Color(0xFF16191C) // primary text and figures
    val Ink2 = Color(0xFF565D66) // secondary / supporting copy
    val Ink3 = Color(0xFF646C77) // tertiary / captions
    val InkOnAccent = Color(0xFFFFFFFF)

    // Accent — deep emerald, interactive affordance ONLY.
    val Accent = Color(0xFF0E7A57)
    val AccentPress = Color(0xFF0A5F44)
    val AccentTint = Color(0xFFE2F1EB)

    // Semantic — state only, never decorative. Deliberately no "positive"
    // green: a second green would collide with Accent.
    val Caution = Color(0xFFA15C00)
    val CautionTint = Color(0xFFFBEEDC)
    val Critical = Color(0xFFB3261E)
    val CriticalTint = Color(0xFFFBE9E7)

    val Scrim = Color(0x7A10191C)

    // Category ramp — twelve hues, ~equal lightness/chroma, all >=3:1 on
    // Surface. This is where "colourful" lives. Index 0..11 maps to
    // UiCategory.colorIndex (colorIndex % 12), never a raw hex at a call site.
    val CategoryRamp: List<Color> = listOf(
        Color(0xFFC06B6B), // cat-1  red
        Color(0xFFAB7A49), // cat-2  terracotta
        Color(0xFF88883A), // cat-3  gold/olive
        Color(0xFF66903C), // cat-4  lime/moss
        Color(0xFF409640), // cat-5  green
        Color(0xFF3E9369), // cat-6  jade
        Color(0xFF3C9090), // cat-7  teal
        Color(0xFF5787B7), // cat-8  azure
        Color(0xFF7777C5), // cat-9  indigo
        Color(0xFF9A72C3), // cat-10 violet
        Color(0xFFBC62BC), // cat-11 magenta
        Color(0xFFBE6793), // cat-12 pink
    )

    fun categoryColor(index: Int): Color {
        if (CategoryRamp.isEmpty()) return Ink3
        val safeIndex = ((index % CategoryRamp.size) + CategoryRamp.size) % CategoryRamp.size
        return CategoryRamp[safeIndex]
    }
}
