package com.tally.app.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.tally.app.ui.model.Cents
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType

/**
 * Every amount in the app renders through this (or [MoneyHeroText]) — never
 * a bare `Text(formatMoney(...))` with ad hoc styling. Tabular figures,
 * weight 600, slight negative tracking (DESIGN-V3.md §2's `.money`).
 */
@Composable
fun MoneyText(
    cents: Cents,
    modifier: Modifier = Modifier,
    color: Color = TallyColors.Ink1,
    showSign: Boolean = false,
    hideCents: Boolean = false,
    fontSize: androidx.compose.ui.unit.TextUnit = androidx.compose.ui.unit.TextUnit.Unspecified,
) {
    Text(
        text = formatMoney(cents, showSign = showSign, hideCents = hideCents),
        style = if (fontSize != androidx.compose.ui.unit.TextUnit.Unspecified) {
            TallyType.Money.copy(fontSize = fontSize)
        } else {
            TallyType.Money
        },
        color = color,
        modifier = modifier,
    )
}

/** The equation's headline "Left" figure — `.money-hero` (DESIGN-V3.md §2). */
@Composable
fun MoneyHeroText(cents: Cents, modifier: Modifier = Modifier, color: Color = TallyColors.Ink1) {
    Text(
        text = formatMoney(cents),
        style = TallyType.MoneyHero,
        color = color,
        modifier = modifier,
    )
}
