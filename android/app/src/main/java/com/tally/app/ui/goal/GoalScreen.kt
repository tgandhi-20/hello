package com.tally.app.ui.goal

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tally.app.money.MonthMoneySavingsProgress
import com.tally.app.ui.components.MoneyHeroText
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyBackHeader
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.model.applyKeypadKey
import com.tally.app.ui.model.centsToKeypadBuffer
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.keypadBufferToCents
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyControlRadius
import com.tally.app.ui.theme.TallyPillRadius
import com.tally.app.ui.theme.TallyType
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Deposit plan — progress toward the apartment deposit (Menu's "Deposit
 * plan" row and Home's one-line summary, DESIGN-V4.md §1/§2).
 *
 * EVERY figure on this screen is read straight off [savingsProgress], the
 * SAME `MonthMoneySavingsProgress` the equation's own "Savings" line and
 * Home's deposit-plan row are built from (`money/MonthMoney.kt`'s
 * `buildSavingsProgress`, reused through `computeMonthMoney` — never a second,
 * independently-computed projection). This file computes nothing financial of
 * its own beyond simple display arithmetic on fields that already belong to
 * the SAME object (e.g. a progress-bar fraction of `actualBalanceCents` over
 * `goalTargetCents`), matching docs/AGENT-BRIEF.md §3's "one money engine".
 *
 * HONESTY (the whole reason this screen exists as more than one card): when
 * [MonthMoneySavingsProgress.isBalanceUserEntered] is false,
 * `actualBalanceCents` is really the plan's own projection standing in
 * because the user has never told Tally a real balance. That fact is stated
 * in words, not just implied by field naming — a projection rendered as a
 * bank balance is the kind of wrong that costs someone a house deposit
 * (docs/PERSONAL.md §6, the task brief). The user can enter their real
 * balance from here, or (once they have) revert to letting Tally project it.
 */
@Composable
fun GoalScreen(
    savingsProgress: MonthMoneySavingsProgress,
    onSaveActualBalance: (Long?) -> Unit,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    var editing by remember { mutableStateOf(false) }
    var buffer by remember { mutableStateOf("") }

    fun startEditing() {
        val startFrom = if (savingsProgress.isBalanceUserEntered) savingsProgress.actualBalanceCents else 0L
        buffer = if (startFrom > 0L) centsToKeypadBuffer(startFrom) else ""
        editing = true
    }

    fun cancelEditing() {
        editing = false
        buffer = ""
    }

    fun saveBuffer() {
        onSaveActualBalance(keypadBufferToCents(buffer))
        editing = false
        buffer = ""
    }

    fun useProjectionInstead() {
        onSaveActualBalance(null)
        editing = false
        buffer = ""
    }

    val behindColor = if (savingsProgress.onTrack) TallyColors.Ink2 else TallyColors.Caution

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
            text = "Deposit plan",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )

        Card(
            shape = RoundedCornerShape(TallyCardRadius),
            colors = CardDefaults.cardColors(containerColor = TallyColors.Surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = if (savingsProgress.isBalanceUserEntered) "Your balance" else "Projected balance",
                    style = MaterialTheme.typography.labelMedium,
                    color = TallyColors.Ink2,
                )
                MoneyHeroText(cents = savingsProgress.actualBalanceCents)
                Text(
                    text = "of ${formatMoney(savingsProgress.goalTargetCents)} target · " +
                        daysUntilTargetLabel(savingsProgress.daysUntilTarget),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TallyColors.Ink2,
                )
                GoalProgressTrack(fraction = goalProgressFraction(savingsProgress), onTrack = savingsProgress.onTrack)
                Text(
                    text = goalStatusText(savingsProgress),
                    style = MaterialTheme.typography.bodyMedium,
                    color = behindColor,
                )
            }
        }

        if (!savingsProgress.isBalanceUserEntered) {
            Card(
                shape = RoundedCornerShape(TallyCardRadius),
                colors = CardDefaults.cardColors(containerColor = TallyColors.CautionTint),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "This is a projection, not your real balance",
                        style = MaterialTheme.typography.titleSmall,
                        color = TallyColors.Ink1,
                    )
                    Text(
                        text = "You haven't entered a balance yet, so the figure above is what the plan " +
                            "predicts you would have by today — not a number from your bank. Enter your " +
                            "real balance for an accurate picture.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TallyColors.Ink2,
                    )
                    TextButton(
                        onClick = ::startEditing,
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) {
                        Text(text = "Enter your balance", color = TallyColors.AccentPress)
                    }
                }
            }
        } else {
            TallyListGroup {
                TallyListRow(
                    title = "Update your balance",
                    subtitle = "Last told: ${formatMoney(savingsProgress.actualBalanceCents)}",
                    chevron = true,
                    onClick = ::startEditing,
                )
            }
        }

        if (editing) {
            BalanceEntryCard(
                buffer = buffer,
                onKey = { key -> buffer = applyKeypadKey(buffer, key) },
                onCancel = ::cancelEditing,
                onSave = ::saveBuffer,
                onUseProjection = if (savingsProgress.isBalanceUserEntered) ::useProjectionInstead else null,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TallySectionLabel("Plan details")
            TallyListGroup {
                TallyListRow(
                    title = "Monthly target",
                    trailing = { MoneyText(cents = savingsProgress.monthlyTargetCents) },
                )
                TallyDivider()
                TallyListRow(
                    title = "Target date",
                    trailing = {
                        Text(
                            text = formatGoalDate(savingsProgress.goalTargetDate),
                            style = MaterialTheme.typography.bodyLarge,
                            color = TallyColors.Ink1,
                        )
                    },
                )
                TallyDivider()
                TallyListRow(
                    title = "Tally's projection for today",
                    subtitle = "What the plan predicts, whether or not you've entered a real balance",
                    trailing = { MoneyText(cents = savingsProgress.projectedBalanceCents) },
                )
            }
        }
    }
}

@Composable
private fun GoalProgressTrack(fraction: Float, onTrack: Boolean) {
    val fillColor = if (onTrack) TallyColors.Accent else TallyColors.Caution
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

@Composable
private fun BalanceEntryCard(
    buffer: String,
    onKey: (String) -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
    onUseProjection: (() -> Unit)?,
) {
    Card(
        shape = RoundedCornerShape(TallyCardRadius),
        colors = CardDefaults.cardColors(containerColor = TallyColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(text = "Enter your real balance", style = MaterialTheme.typography.titleSmall, color = TallyColors.Ink1)
            Text(
                text = if (buffer.isNotEmpty()) formatMoney(keypadBufferToCents(buffer)) else formatMoney(0L),
                style = TallyType.MoneyHero,
                color = TallyColors.Ink1,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            BalanceKeypad(onKey = onKey, disabledBackspace = buffer.isEmpty())
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = "Cancel", color = TallyColors.Ink2)
                }
                Button(
                    onClick = onSave,
                    enabled = buffer.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TallyColors.Accent,
                        contentColor = TallyColors.InkOnAccent,
                        disabledContainerColor = TallyColors.SurfaceSunk,
                        disabledContentColor = TallyColors.Ink3,
                    ),
                    shape = RoundedCornerShape(TallyCardRadius),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = "Save", style = MaterialTheme.typography.titleSmall)
                }
            }
            if (onUseProjection != null) {
                TextButton(onClick = onUseProjection, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = "Use Tally's projection instead", color = TallyColors.Ink3)
                }
            }
        }
    }
}

private val BALANCE_KEYS = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back")

/**
 * A small, local numeric pad for the balance field — deliberately not shared
 * with `ui/quickadd`'s keypad (a different owned package); this reuses the
 * same pure buffer helpers from `ui/model/Keypad.kt` that quick-add uses, so
 * the two stay behaviourally identical without a cross-feature composable
 * dependency.
 */
@Composable
private fun BalanceKeypad(onKey: (String) -> Unit, disabledBackspace: Boolean) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BALANCE_KEYS.chunked(3).forEach { row ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    val enabled = key != "back" || !disabledBackspace
                    BalanceKeypadKey(
                        label = if (key == "back") "⌫" else key,
                        a11yLabel = when (key) {
                            "back" -> "Backspace"
                            "." -> "Decimal point"
                            else -> "Digit $key"
                        },
                        enabled = enabled,
                        onClick = { onKey(key) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun BalanceKeypadKey(
    label: String,
    a11yLabel: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentColor = if (enabled) TallyColors.Ink1 else TallyColors.Ink3
    Column(
        modifier = modifier
            .heightIn(min = 48.dp)
            .background(TallyColors.SurfaceSunk, RoundedCornerShape(TallyControlRadius))
            .then(
                if (enabled) {
                    Modifier.a11yRow(description = a11yLabel, onClick = onClick)
                } else {
                    Modifier.semantics { contentDescription = a11yLabel }
                },
            )
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = label, style = MaterialTheme.typography.headlineSmall, color = contentColor)
    }
}

// ---------------------------------------------------------------------------
// Pure helpers — no Compose dependency, unit-testable directly.
// ---------------------------------------------------------------------------

/** Fraction of the deposit target reached, clamped to [0, 1] and safe against
 *  a zero/negative target (never divides by a value that could be zero). */
internal fun goalProgressFraction(progress: MonthMoneySavingsProgress): Float {
    val target = progress.goalTargetCents
    if (target <= 0L) return 0f
    return (progress.actualBalanceCents.toFloat() / target.toFloat()).coerceIn(0f, 1f)
}

/** One calm, factual line — never a scold (docs/AGENT-BRIEF.md §5's tone rule). */
internal fun goalStatusText(progress: MonthMoneySavingsProgress): String =
    if (progress.onTrack) {
        "On track for the ${formatMoney(progress.goalTargetCents)} target."
    } else {
        "${formatMoney(progress.behindCents)} behind where the plan expects to be by now."
    }

internal fun daysUntilTargetLabel(daysUntilTarget: Int): String = when {
    daysUntilTarget < 0 -> "target date has passed"
    daysUntilTarget == 0 -> "target date is today"
    daysUntilTarget == 1 -> "1 day left"
    else -> "$daysUntilTarget days left"
}

private val GOAL_DATE_FORMAT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.Builder().setLanguage("en").setRegion("AU").build())

internal fun formatGoalDate(date: LocalDate): String = GOAL_DATE_FORMAT.format(date)
