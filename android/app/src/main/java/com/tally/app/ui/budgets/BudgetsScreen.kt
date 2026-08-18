package com.tally.app.ui.budgets

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tally.app.personal.CATEGORY_IDS
import com.tally.app.personal.NET_HOUSING_CENTS
import com.tally.app.personal.PERSONAL_CATEGORIES
import com.tally.app.personal.categoryCapCents
import com.tally.app.ui.components.CategoryBadge
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyBackHeader
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiCategorySpend
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyPillRadius
import com.tally.app.ui.theme.TallyType

/**
 * Budgets — per-category monthly caps versus what has actually been spent
 * this month (Menu's "Monthly caps by category" row, DESIGN-V4.md §2).
 *
 * EVERY spend figure on this screen comes from ONE upstream call
 * ([TallyDataSource.monthMoney], read once at the top of [BudgetsScreen] and
 * passed down) — this file never sums a transaction itself (docs/AGENT-BRIEF.md
 * section 3, docs/DESIGN-V4.md section 1). The only other numbers here are the
 * caps themselves, which are plan constants from `com.tally.app.personal`, not
 * money computed from transactions.
 *
 * Categories shown are the fourteen "need"/"want" categories that carry a
 * monthly cap (`com.tally.app.personal.LIVING_COST_CATEGORY_IDS`, mirrored
 * locally below so this file can group Housing separately from everything
 * else). Savings is deliberately left off this screen — it already has its
 * own place (Menu's "Deposit plan" / the goal screen), and repeating the same
 * figure here would be a second view of a number this screen has no new
 * information to add to. Income, one-offs and "Other" have no monthly cap
 * (`categoryCapCents` returns `null` for them) and are likewise not shown.
 */
private val HOUSING_IDS = listOf(CATEGORY_IDS.rent, CATEGORY_IDS.sublet, CATEGORY_IDS.utilities)

private val EVERYDAY_IDS = listOf(
    CATEGORY_IDS.family,
    CATEGORY_IDS.groceries,
    CATEGORY_IDS.transport,
    CATEGORY_IDS.eatingOut,
    CATEGORY_IDS.lunch,
    CATEGORY_IDS.coffee,
    CATEGORY_IDS.health,
    CATEGORY_IDS.phone,
    CATEGORY_IDS.shopping,
    CATEGORY_IDS.subscriptions,
    CATEGORY_IDS.skincare,
)

internal data class BudgetEntry(
    val categoryId: String,
    val label: String,
    val colorIndex: Int,
    /** `null` = no cap for this category (never actually null for the ids this
     *  screen displays, since both lists above are all-capped, but kept
     *  nullable so [categoryCapCents]'s real contract is represented honestly). */
    val capCents: Long?,
    val spentCents: Long,
)

/**
 * Pairs each requested category id with its label/colour (from the vault's
 * live category list, falling back to the personal plan's own label if the
 * category hasn't been seeded into the vault yet) and its spend this month
 * (from [byCategory], defaulting to zero for a category with nothing logged
 * yet — that default is the identity element, not a computed figure).
 */
internal fun buildBudgetEntries(
    categoryIds: List<String>,
    categories: List<UiCategory>,
    byCategory: List<UiCategorySpend>,
): List<BudgetEntry> {
    val catById = categories.associateBy { it.id }
    val spentById = byCategory.associateBy { it.categoryId }
    return categoryIds.map { id ->
        val cat = catById[id]
        val fallbackLabel = PERSONAL_CATEGORIES.find { it.id == id }?.label ?: id
        BudgetEntry(
            categoryId = id,
            label = cat?.label ?: fallbackLabel,
            colorIndex = cat?.colorIndex ?: 0,
            capCents = categoryCapCents(id),
            spentCents = spentById[id]?.spentCents ?: 0L,
        )
    }
}

/** Fraction of a spend cap used, clamped to [0, 1]. A non-positive cap (the
 *  sublet row, whose "cap" is really recurring income) has no meaningful
 *  "used" fraction, so this is always 0 for it — callers show that row
 *  differently instead of a progress bar. */
internal fun budgetProgressFraction(entry: BudgetEntry): Float {
    val cap = entry.capCents ?: return 0f
    if (cap <= 0L) return 0f
    return (entry.spentCents.toFloat() / cap.toFloat()).coerceIn(0f, 1f)
}

internal fun isOverBudget(entry: BudgetEntry): Boolean {
    val cap = entry.capCents ?: return false
    return cap > 0L && entry.spentCents > cap
}

@Composable
fun BudgetsScreen(
    dataSource: TallyDataSource,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    val money = dataSource.monthMoney.value
    val categories = dataSource.categories.value

    val housing = buildBudgetEntries(HOUSING_IDS, categories, money.byCategory)
    val everyday = buildBudgetEntries(EVERYDAY_IDS, categories, money.byCategory)

    val rentCap = housing.find { it.categoryId == CATEGORY_IDS.rent }?.capCents ?: 0L
    val subletCap = housing.find { it.categoryId == CATEGORY_IDS.sublet }?.capCents ?: 0L
    val utilitiesCap = housing.find { it.categoryId == CATEGORY_IDS.utilities }?.capCents ?: 0L

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        TallyBackHeader(onBack = onBack)

        Text(
            text = "Budgets",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )
        Text(
            text = "Monthly caps by category, against what this month has actually cost so far.",
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink2,
        )

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TallySectionLabel("Housing")
            TallyListGroup {
                housing.forEachIndexed { index, entry ->
                    if (index > 0) TallyDivider()
                    if (entry.categoryId == CATEGORY_IDS.sublet) {
                        SubletRow(entry)
                    } else {
                        BudgetRow(entry)
                    }
                }
            }
            Text(
                text = "Net of ${formatMoney(-subletCap)} sublet income and ${formatMoney(utilitiesCap)} " +
                    "utilities, housing runs ${formatMoney(NET_HOUSING_CENTS)} a month — not the " +
                    "${formatMoney(rentCap)} rent cap on its own.",
                style = MaterialTheme.typography.bodyMedium,
                color = TallyColors.Ink3,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TallySectionLabel("Everyday")
            TallyListGroup {
                everyday.forEachIndexed { index, entry ->
                    if (index > 0) TallyDivider()
                    BudgetRow(entry)
                }
            }
        }
    }
}

@Composable
private fun BudgetRow(entry: BudgetEntry) {
    val cap = entry.capCents
    val over = isOverBudget(entry)
    val fraction = budgetProgressFraction(entry)
    val figureColor = if (over) TallyColors.Critical else TallyColors.Ink1
    val statusColor = if (over) TallyColors.Critical else TallyColors.Ink2

    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // weight(1f): an unweighted long category label would grow past
            // the row's width under SpaceBetween and push the spent figure
            // off-screen instead of the label yielding to it.
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CategoryBadge(colorIndex = entry.colorIndex, label = entry.label)
                // weight here too, not just on the wrapping Row above: Row
                // measures non-weighted children against its FULL available
                // width regardless of siblings already placed, so without
                // its own weight this Text would still be free to measure
                // past the space the badge already claimed.
                Text(
                    text = entry.label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = TallyColors.Ink1,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
            MoneyText(cents = entry.spentCents, color = figureColor)
        }
        if (cap != null && cap > 0L) {
            BudgetProgressTrack(fraction = fraction, over = over)
            Text(
                text = if (over) {
                    "${formatMoney(entry.spentCents - cap)} over the ${formatMoney(cap)} cap"
                } else {
                    "${formatMoney(cap - entry.spentCents)} left of ${formatMoney(cap)}"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = statusColor,
            )
        } else {
            Text(text = "No monthly cap set", style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink3)
        }
    }
}

@Composable
private fun SubletRow(entry: BudgetEntry) {
    val expectedIncomeCents = entry.capCents?.let { -it } ?: 0L
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CategoryBadge(colorIndex = entry.colorIndex, label = entry.label)
                Text(text = entry.label, style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
            }
            MoneyText(cents = expectedIncomeCents, showSign = true, color = TallyColors.Ink2)
        }
        Text(
            text = "Expected rent-offsetting income, not a spending cap — it never shows as over or under.",
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink3,
        )
    }
}

/** A thin, calm progress track — "a number and a bar is enough" (docs/AGENT-BRIEF.md
 *  section 5). Colour only changes at caution/critical thresholds; it is never a
 *  new colour beyond [TallyColors]. */
@Composable
private fun BudgetProgressTrack(fraction: Float, over: Boolean) {
    val fillColor = when {
        over -> TallyColors.Critical
        fraction >= 0.9f -> TallyColors.Caution
        else -> TallyColors.Accent
    }
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
                .background(fillColor, RoundedCornerShape(TallyPillRadius)),
        )
    }
}
