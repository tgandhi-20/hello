package com.tally.app.ui.spend

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.CategoryBadge
import com.tally.app.ui.components.MoneyHeroText
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyEmptyState
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.model.Cents
import com.tally.app.ui.model.UiCategorySpend
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.formatMonthLabel
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyPillRadius
import com.tally.app.ui.theme.TallyType
import java.time.YearMonth

/**
 * Spend — the category breakdown for a month; Tally's equivalent of the
 * CommBank app's Spend tracker (docs/DESIGN-V5.md section 1/section 3), a
 * new top-level tab.
 *
 * EVERY spend figure on this screen comes from ONE upstream call
 * ([TallyDataSource.monthMoney], read once at the top of [SpendScreen] and
 * passed down) — this file never sums a transaction itself
 * (docs/AGENT-BRIEF.md section 3, docs/DESIGN-V4.md section 1). The total is
 * `money.spentCents`; each row is one of `money.byCategory`, which the money
 * engine already sorts largest-first and which already sums exactly to
 * `money.spentCents` — this file only formats and lays those numbers out.
 *
 * Month navigation: [TallyDataSource.monthMoney] currently only ever holds
 * the CURRENT month (see that interface's own doc comment) — there is no way
 * to ask it for another month. This screen deliberately does not work around
 * that by scanning `transactions` locally for a different month: that would
 * recreate the "second money engine" problem docs/PERSONAL.md and
 * docs/DESIGN-V4.md both warn about, where a figure computed here could
 * quietly disagree with the same category's total on Home. So the
 * previous/next controls are real UI, always rendered, and always disabled
 * for now, with a caption saying so plainly — an honest, obviously-
 * incomplete control beats a number that might not match. See
 * [SpendMonthNav]'s doc comment for exactly what unblocks this.
 */
@Composable
fun SpendScreen(
    dataSource: TallyDataSource,
    onOpenCategory: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val money = dataSource.monthMoney.value
    val monthLabel = remember { formatMonthLabel(YearMonth.now()) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = "Spend",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )

        SpendMonthNav(label = monthLabel)

        TotalSpentCard(spentCents = money.spentCents, monthLabel = monthLabel)

        SpendCategoriesSection(
            byCategory = money.byCategory,
            totalCents = money.spentCents,
            onOpenCategory = onOpenCategory,
        )
    }
}

/**
 * Previous/next month controls. Both are disabled today — see this file's
 * top doc comment for why. What unblocks them: a `TallyDataSource` addition
 * along the lines of
 *
 *     suspend fun monthMoneyFor(month: java.time.YearMonth): UiMonthMoney
 *
 * (or an equivalent month parameter threaded onto the existing `monthMoney`
 * state) so this screen can ask the ONE money engine for a different month's
 * figures instead of ever deriving one itself. Once that exists, this
 * composable's two `Box`es become clickable exactly like
 * `TransactionsScreen.kt`'s own prev/next month controls (`goPrevMonth`,
 * `goNextMonth`, and a `nextDisabled` guard that never lets `month` advance
 * past `YearMonth.now()`), and the caption below is deleted.
 */
@Composable
private fun SpendMonthNav(label: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                TallyIcons.ChevronLeft(tint = TallyColors.Ink3, modifier = Modifier.size(24.dp))
            }
            Text(text = label, style = MaterialTheme.typography.titleSmall, color = TallyColors.Ink1)
            Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                TallyIcons.ChevronRight(tint = TallyColors.Ink3, modifier = Modifier.size(24.dp))
            }
        }
        Text(
            text = "Only this month is available right now",
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink3,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun TotalSpentCard(spentCents: Cents, monthLabel: String) {
    Card(
        shape = RoundedCornerShape(TallyCardRadius),
        colors = CardDefaults.cardColors(containerColor = TallyColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(text = "Total spent · $monthLabel", style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink2)
            MoneyHeroText(cents = spentCents)
        }
    }
}

@Composable
private fun SpendCategoriesSection(
    byCategory: List<UiCategorySpend>,
    totalCents: Cents,
    onOpenCategory: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel("Categories")
        if (byCategory.isEmpty()) {
            // Empty month -> an honest empty state, never a fake bar
            // (docs/AGENT-BRIEF.md section 5).
            TallyListGroup {
                TallyEmptyState(
                    headline = "Nothing logged this month",
                    body = "Spending you log or import shows up here, biggest category first.",
                )
            }
        } else {
            TallyListGroup {
                byCategory.forEachIndexed { index, row ->
                    if (index > 0) TallyDivider()
                    SpendCategoryRow(
                        entry = row,
                        totalCents = totalCents,
                        onClick = { onOpenCategory(row.categoryId) },
                    )
                }
            }
        }
    }
}

/** One category row: badge, label, share of the month's total, the amount,
 *  and a horizontal bar sized to that share. The whole row is tappable —
 *  this screen does not own navigation, so it only reports which category
 *  was tapped via [onClick] (docs/AGENT-BRIEF.md section 6). */
@Composable
private fun SpendCategoryRow(entry: UiCategorySpend, totalCents: Cents, onClick: () -> Unit) {
    val percent = categorySharePercent(entry.spentCents, totalCents)
    val fraction = categoryShareFraction(entry.spentCents, totalCents)
    val barColor = TallyColors.categoryColor(entry.colorIndex)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .a11yRow(
                description = "${entry.label}, ${formatMoney(entry.spentCents)}, $percent percent of this " +
                    "month's spending. Open transactions.",
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CategoryBadge(colorIndex = entry.colorIndex, label = entry.label)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = entry.label, style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
                    Text(text = "$percent% of spending", style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink2)
                }
            }
            MoneyText(cents = entry.spentCents)
        }
        SpendShareTrack(fraction = fraction, color = barColor)
    }
}

/** A thin bar sized to one category's share of the month, in the category's
 *  own ramp colour — the "simple horizontal bar per row" the brief asks for. */
@Composable
private fun SpendShareTrack(fraction: Float, color: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .background(TallyColors.SurfaceSunk, RoundedCornerShape(TallyPillRadius)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .fillMaxHeight()
                .background(color, RoundedCornerShape(TallyPillRadius)),
        )
    }
}

/**
 * A category's percentage of the month's total spend, rounded to the
 * nearest whole percent using integer arithmetic only — never a Double on a
 * `*Cents` value (docs/AGENT-BRIEF.md section 2). Guarded against a zero or
 * negative total: an empty or all-zero month reads as 0%, never a divide
 * that could produce NaN or a crash.
 */
internal fun categorySharePercent(spentCents: Cents, totalCents: Cents): Int {
    if (totalCents <= 0L) return 0
    return (((spentCents * 100L) + (totalCents / 2L)) / totalCents).toInt().coerceIn(0, 100)
}

/**
 * The same share as a 0f..1f fraction, for the bar's width. A `Float` is the
 * right type here — it is a proportion, not a money amount, and
 * docs/AGENT-BRIEF.md section 2's "integer cents, never Double" rule governs
 * money, not bar widths. Guarded the same way as [categorySharePercent].
 */
internal fun categoryShareFraction(
    spentCents: Cents,
    totalCents: Cents,
): Float {
    if (totalCents <= 0L) return 0f
    return (spentCents.toFloat() / totalCents.toFloat()).coerceIn(0f, 1f)
}
