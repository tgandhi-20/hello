package com.tally.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

/**
 * Card / list-group corner radius (DESIGN-V3.md §3: "Card radius 16px").
 * Named so every rounded surface in the app shares one value.
 */
val TallyCardRadius = 16.dp
val TallyControlRadius = 12.dp
val TallyPillRadius = 999.dp

private val TallyColorScheme = lightColorScheme(
    background = TallyColors.Ground,
    onBackground = TallyColors.Ink1,
    surface = TallyColors.Surface,
    onSurface = TallyColors.Ink1,
    surfaceVariant = TallyColors.SurfaceSunk,
    onSurfaceVariant = TallyColors.Ink2,
    primary = TallyColors.Accent,
    onPrimary = TallyColors.InkOnAccent,
    primaryContainer = TallyColors.AccentTint,
    onPrimaryContainer = TallyColors.AccentPress,
    secondary = TallyColors.Ink2,
    onSecondary = TallyColors.InkOnAccent,
    error = TallyColors.Critical,
    onError = TallyColors.InkOnAccent,
    errorContainer = TallyColors.CriticalTint,
    onErrorContainer = TallyColors.Critical,
    outline = TallyColors.Hairline,
    outlineVariant = TallyColors.Hairline,
    scrim = TallyColors.Scrim,
)

private val TallyShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(TallyControlRadius),
    medium = RoundedCornerShape(TallyCardRadius),
    large = RoundedCornerShape(TallyCardRadius),
    extraLarge = RoundedCornerShape(28.dp),
)

/**
 * Root theme wrapper. Always the light v3 palette (DESIGN-V3.md §1: "Dark
 * mode is out of scope for v3") — deliberately does not branch on
 * isSystemInDarkTheme(), so this one-user phone always sees the measured,
 * WCAG-checked palette regardless of its system theme setting.
 */
@Composable
fun TallyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TallyColorScheme,
        typography = TallyTypography,
        shapes = TallyShapes,
        content = content,
    )
}
