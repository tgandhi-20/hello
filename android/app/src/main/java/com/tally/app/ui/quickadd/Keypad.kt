package com.tally.app.ui.quickadd

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.a11yClickable
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyControlRadius

private val KEYS = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back")

/**
 * Custom numeric keypad — never the OS keyboard (it's slow to appear and
 * covers half the screen, and this screen needs to keep working one-handed
 * in landscape too). 3 columns x 4 rows, thumb-reachable, every key well
 * over the 48dp touch-target floor.
 */
@Composable
fun QuickAddKeypad(onKey: (String) -> Unit, disabledBackspace: Boolean, modifier: Modifier = Modifier) {
    val haptics = LocalHapticFeedback.current

    fun press(key: String) {
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onKey(key)
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        KEYS.chunked(3).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { key ->
                    val enabled = key != "back" || !disabledBackspace
                    KeypadKey(
                        label = if (key == "back") "⌫" else key,
                        a11yLabel = when (key) {
                            "back" -> "Backspace"
                            "." -> "Decimal point"
                            else -> "Digit $key"
                        },
                        enabled = enabled,
                        onClick = { press(key) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun KeypadKey(
    label: String,
    a11yLabel: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val background = TallyColors.Surface
    val contentColor = if (enabled) TallyColors.Ink1 else TallyColors.Ink3
    Column(
        modifier = modifier
            .heightIn(min = 56.dp)
            .background(background, RoundedCornerShape(TallyControlRadius))
            .then(
                if (enabled) {
                    Modifier.a11yClickable(description = a11yLabel, onClick = onClick)
                } else {
                    Modifier.semantics { contentDescription = a11yLabel }
                }
            )
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = label, style = MaterialTheme.typography.headlineSmall, color = contentColor)
    }
}
