package com.tally.app.ui.lock

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.security.MAX_PIN_LENGTH
import com.tally.app.ui.components.a11yClickable
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyControlRadius

/**
 * Pure keystroke bookkeeping for a PIN buffer — turns one keypress into the
 * next buffer state. Mirrors the amount keypad's `applyKeypadKey`
 * (`ui/model/Keypad.kt`) in spirit: no Android/Compose dependency, so it is
 * directly JUnit-testable (see PinPadTest.kt) and is the single place both
 * [com.tally.app.ui.lock.LockScreen]'s setup and unlock flows apply a key,
 * so they can never drift on capping/backspace behaviour.
 */
internal fun applyPinKey(buffer: String, key: String, maxLength: Int = MAX_PIN_LENGTH): String = when {
    key == "back" -> buffer.dropLast(1)
    buffer.length >= maxLength -> buffer
    key.length == 1 && key[0].isDigit() -> buffer + key
    else -> buffer // ignore anything unexpected (e.g. the blank spacer cell)
}

/** "" marks a blank cell (keeps the 0/back pair visually centred under 7-8-9). */
private val PORTRAIT_ROWS = listOf(
    listOf("1", "2", "3"),
    listOf("4", "5", "6"),
    listOf("7", "8", "9"),
    listOf("", "0", "back"),
)

/**
 * Wider, shorter layout for the landscape/short-viewport case — two rows
 * instead of four, so the whole pad fits well inside a rotated phone's
 * available height.
 */
private val LANDSCAPE_ROWS = listOf(
    listOf("1", "2", "3", "4", "5"),
    listOf("6", "7", "8", "9", "0", "back"),
)

/**
 * Custom numeric PIN pad — never the OS keyboard. Every key >=48dp (via
 * [a11yClickable]'s size floor, well under this pad's 56dp rows).
 *
 * LANDSCAPE SAFETY: the web app once shipped a PIN pad whose bottom row fell
 * off a rotated screen — which meant being unable to open the app at all.
 * This pad switches to a wider, shorter grid (two rows instead of four)
 * whenever the viewport is wider than it is tall. That alone is the primary
 * defence; [com.tally.app.ui.lock.LockScreen] additionally wraps the whole
 * screen (headline, buffer, this pad, and the primary action) in a
 * `verticalScroll` column, so even if this orientation check is ever wrong
 * on some device, every key stays reachable by scrolling rather than being
 * clipped off-screen.
 */
@Composable
fun PinPad(onKey: (String) -> Unit, disabledBackspace: Boolean, modifier: Modifier = Modifier) {
    val haptics = LocalHapticFeedback.current
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.screenWidthDp > configuration.screenHeightDp
    val rows = if (isLandscape) LANDSCAPE_ROWS else PORTRAIT_ROWS

    fun press(key: String) {
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onKey(key)
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    if (key.isEmpty()) {
                        Spacer(modifier = Modifier.weight(1f))
                    } else {
                        val enabled = key != "back" || !disabledBackspace
                        PinKey(
                            label = if (key == "back") "⌫" else key,
                            a11yLabel = if (key == "back") "Backspace" else "Digit $key",
                            enabled = enabled,
                            onClick = { press(key) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PinKey(
    label: String,
    a11yLabel: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentColor = if (enabled) TallyColors.Ink1 else TallyColors.Ink3
    Column(
        modifier = modifier
            .heightIn(min = 56.dp)
            .background(TallyColors.Surface, RoundedCornerShape(TallyControlRadius))
            .then(
                if (enabled) {
                    Modifier.a11yClickable(description = a11yLabel, onClick = onClick)
                } else {
                    Modifier.semantics { contentDescription = a11yLabel }
                },
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = label, style = MaterialTheme.typography.headlineSmall, color = contentColor)
    }
}
