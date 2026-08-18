package com.tally.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.TextUnit
import com.tally.app.money.AccountId
import com.tally.app.ui.accounts.AccountsSection
import com.tally.app.ui.components.GlyphBadge
import com.tally.app.ui.components.MoneyHeroText
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyChip
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyEmptyState
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.model.Cents
import com.tally.app.ui.model.UiBillDueSoon
import com.tally.app.ui.model.UiDepositPlan
import com.tally.app.ui.model.UiMonthMoney
import com.tally.app.ui.model.UiToSortOutItem
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.formatRelativeDay
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType

/**
 * Home — the summary screen (DESIGN-V4.md §1/§2). Every figure on this
 * screen comes from ONE upstream call ([TallyDataSource.monthMoney]) — no
 * section here recomputes a total of its own, matching the equivalent web
 * screen's own doc comment (`src/features/today/TodayScreen.tsx`).
 *
 * In order (DESIGN-V4.md §1):
 *   1. The equation — the actual subtraction, laid out.
 *   2. Where it went — this month's category breakdown, largest first.
 *   3. Bills due soon — the next 14 days.
 *   4. Deposit plan — one row, not a card.
 *   5. To sort out — renders ONLY when there's genuinely something to say.
 */
@Composable
fun HomeScreen(
    dataSource: TallyDataSource,
    modifier: Modifier = Modifier,
    onOpenDepositPlan: () -> Unit = {},
    onOpenToSortOutItem: (UiToSortOutItem) -> Unit = {},
) {
    val money = dataSource.monthMoney.value
    val bills = dataSource.billsDueSoon.value
    val deposit = dataSource.depositPlan.value
    val toSortOut = dataSource.toSortOut.value
    val skipped = dataSource.skippedRecordCount.value

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = "Home",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )

        // Above the equation, deliberately. If some records could not be
        // decrypted then every figure below this line is understated, and a
        // total that is quietly too low is the worst thing this app can show:
        // it looks like good news. The notice has to be impossible to miss and
        // has to come before the numbers it qualifies.
        if (skipped > 0) SkippedRecordsNotice(skipped)

        EquationSection(money)
        WhereItWentSection(money)
        BillsDueSoonSection(bills)
        DepositPlanRow(deposit, onClick = onOpenDepositPlan)
        ToSortOutSection(toSortOut, onClick = onOpenToSortOutItem)
    }
}

/**
 * Shown when the vault could not decrypt some records.
 *
 * Every total on this screen is computed from the records that WERE readable,
 * so when this appears the figures below it are too low. That is a dangerous
 * kind of wrong — spending looks smaller and "left to spend" looks larger, so
 * the error flatters rather than alarms. The wording therefore says what the
 * consequence is, not just that something failed, and says what to do about
 * it.
 *
 * Caution rather than critical: the data is not lost, and the vault is not
 * broken. Restoring a backup is a real fix, and panicking the user into
 * wiping and starting over would be the worse outcome.
 */
@Composable
private fun SkippedRecordsNotice(count: Int) {
    val label = if (count == 1) "1 record" else "$count records"
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TallyColors.CautionTint),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "$label could not be read",
                style = TallyType.BodyLarge,
                color = TallyColors.Caution,
            )
            Text(
                text = "The totals below leave them out, so they are lower than " +
                    "your real figures. Restoring your most recent backup usually " +
                    "brings them back.",
                style = TallyType.Body,
                color = TallyColors.Ink2,
            )
        }
    }
}

@Composable
private fun EquationSection(money: UiMonthMoney) {
    val over = money.leftCents < 0
    Card(
        shape = RoundedCornerShape(TallyCardRadius),
        colors = CardDefaults.cardColors(containerColor = TallyColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                EquationRow(operator = null, label = "Income", cents = money.incomeCents, incomeUnset = money.incomeUnset)
                EquationRow(operator = "−", label = "Bills", cents = money.billsCents)
                EquationRow(operator = "−", label = "Savings", cents = money.savingsCents)
            }

            TallyDivider()

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                EquationRow(operator = "=", label = "To spend", cents = money.toSpendCents, emphasis = true)
                EquationRow(operator = null, label = "Already spent", cents = money.spentCents)
            }

            TallyDivider()

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Text(
                        text = "= Left",
                        style = MaterialTheme.typography.titleSmall,
                        color = TallyColors.Ink1,
                    )
                    // Hero figure stays Ink1 even negative — over-target colours a
                    // supporting line, never the hero figure (CONSTRAINTS).
                    MoneyHeroText(cents = money.leftCents)
                }
                Text(
                    text = "${formatMoney(money.leftCents)} left · ${formatMoney(money.leftTodayCents)} a day for " +
                        "${money.daysRemaining} day${if (money.daysRemaining == 1) "" else "s"}.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TallyColors.Ink2,
                )
                if (over) {
                    Text(
                        text = "That's a negative number — bills, savings and what's already gone add up to " +
                            "more than what's left this month. Not a scold, just the maths.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TallyColors.Ink2,
                    )
                }
            }
        }
    }
}

@Composable
private fun EquationRow(
    operator: String?,
    label: String,
    cents: Cents,
    emphasis: Boolean = false,
    incomeUnset: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (operator != null) "$operator $label" else label,
            style = if (emphasis) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            color = if (emphasis) TallyColors.Ink1 else TallyColors.Ink2,
        )
        if (incomeUnset) {
            Text(text = "Add your income", style = MaterialTheme.typography.labelLarge, color = TallyColors.Accent)
        } else {
            MoneyText(
                cents = cents,
                color = if (emphasis) TallyColors.Ink1 else TallyColors.Ink2,
                fontSize = if (emphasis) 17.sp else TextUnit.Unspecified,
            )
        }
    }
}

@Composable
private fun WhereItWentSection(money: UiMonthMoney) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel("Where it went")
        if (money.spentCents == 0L) {
            TallyListGroup {
                TallyEmptyState(
                    headline = "Nothing logged yet this month",
                    body = "Spending you log or import shows up here, biggest category first.",
                )
            }
        } else {
            TallyListGroup {
                money.byCategory.forEachIndexed { index, row ->
                    if (index > 0) TallyDivider()
                    TallyListRow(
                        title = row.label,
                        leading = { CategoryBadge(colorIndex = row.colorIndex, label = row.label) },
                        trailing = { MoneyText(cents = row.spentCents) },
                    )
                }
                TallyDivider()
                TallyListRow(
                    title = "Total",
                    trailing = { MoneyText(cents = money.spentCents, color = TallyColors.Ink1) },
                )
            }
        }
    }
}

@Composable
private fun BillsDueSoonSection(items: List<UiBillDueSoon>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel("Bills due soon · next 14 days")
        if (items.isEmpty()) {
            TallyListGroup {
                TallyEmptyState(
                    headline = "Nothing due in the next 14 days",
                    body = "Regular payments, card due dates and payday show up here once Tally has learned them.",
                )
            }
        } else {
            TallyListGroup {
                items.forEachIndexed { index, item ->
                    if (index > 0) TallyDivider()
                    val amount: Cents? = item.amountCents
                    val trailingContent: (@Composable () -> Unit)? = if (amount != null) {
                        { MoneyText(cents = if (amount < 0) -amount else amount, showSign = amount < 0) }
                    } else {
                        null
                    }
                    TallyListRow(
                        title = item.label,
                        subtitle = if (item.predicted) "We think — not confirmed yet" else null,
                        leading = { TallyChip(formatRelativeDay(item.date)) },
                        trailing = trailingContent,
                    )
                }
            }
        }
    }
}

@Composable
private fun DepositPlanRow(plan: UiDepositPlan, onClick: () -> Unit) {
    val daysLeft = if (plan.daysLeft < 0) 0 else plan.daysLeft
    TallyListGroup {
        TallyListRow(
            title = "Deposit plan",
            subtitle = "${formatMoney(plan.actualBalanceCents)} of ${formatMoney(plan.goalTargetCents)} · " +
                (if (plan.onTrack) "on track" else "${formatMoney(plan.behindCents)} behind") +
                " · $daysLeft day${if (daysLeft == 1) "" else "s"}",
            leading = { GlyphBadge(glyph = "$", background = TallyColors.AccentTint, tint = TallyColors.Accent) },
            chevron = true,
            onClick = onClick,
        )
    }
}

@Composable
private fun ToSortOutSection(items: List<UiToSortOutItem>, onClick: (UiToSortOutItem) -> Unit) {
    // "A section with nothing to say must not render" — this returns nothing
    // at all for an empty list, not an empty-state card (DESIGN-V4.md §1/§3).
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel("To sort out")
        TallyListGroup {
            items.forEachIndexed { index, item ->
                if (index > 0) TallyDivider()
                val amount: Cents? = item.amountCents
                val trailingContent: (@Composable () -> Unit)? = if (amount != null) {
                    { MoneyText(cents = amount) }
                } else {
                    null
                }
                TallyListRow(
                    title = item.title,
                    subtitle = item.subtitle,
                    leading = { GlyphBadge(glyph = "!", tint = TallyColors.Caution, background = TallyColors.CautionTint) },
                    trailing = trailingContent,
                    chevron = true,
                    onClick = { onClick(item) },
                )
            }
        }
    }
}
