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
    // NOT TallyColors.Hairline here, deliberately. Hairline (#E2E6EB) is
    // tuned to sit almost invisibly against Surface/Ground on purpose, for
    // the hand-drawn TallyDivider between list rows — measured 1.25:1 on
    // Surface and 1.16:1 on Ground, fine for a decorative row separator that
    // isn't the only way to tell rows apart (their content is), but a real
    // failure for the one place `outline` actually matters here: it is also
    // Material3's default OutlinedTextField/OutlinedButton border colour,
    // and every OutlinedTextField in this app (PIN entry, the restore
    // secret, the erase-confirmation field, the transaction note) takes
    // that default with no override — at 1.25:1 the field boundary would be
    // essentially invisible, failing the 3:1 WCAG 1.4.11 floor for a UI
    // component boundary a user must actually be able to see to use the
    // field. Ink3 measures 5.31:1 on Surface / 4.90:1 on Ground — comfortably
    // over 3:1 — and is already an existing, measured token (ui/theme/Color.kt),
    // not a new colour.
    outline = TallyColors.Ink3,
    outlineVariant = TallyColors.Ink3,
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
