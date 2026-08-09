package com.tally.app.ui.quickadd

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.CategoryBadge
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.applyKeypadKey
import com.tally.app.ui.model.centsToKeypadBuffer
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.keypadBufferToCents
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.launch

/**
 * Quick-add — the most-used screen in the app. Category tile -> amount
 * (pre-filled from the category's typical spend) -> Save: three taps for a
 * repeat entry. A custom keypad only — never the OS keyboard.
 *
 * Landscape / short-viewport safety: the whole keypad screen sits inside a
 * `verticalScroll` column rather than being pinned to a fixed-height layout.
 * The web app's bug was the Save button landing off-screen on rotation
 * because its layout assumed a tall viewport; here, if the viewport is ever
 * too short for everything to fit unscrolled, the user can still scroll to
 * reach Save instead of losing it — the one thing that must never happen on
 * this screen.
 */
@Composable
fun QuickAddScreen(
    dataSource: TallyDataSource,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
) {
    val categories = dataSource.categories.value
    var selected by remember { mutableStateOf<UiCategory?>(null) }
    var buffer by remember { mutableStateOf("") }
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()

    fun pickCategory(category: UiCategory) {
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        selected = category
        buffer = category.typicalAmountCents?.let { centsToKeypadBuffer(it) } ?: ""
    }

    fun backToGrid() {
        selected = null
        buffer = ""
    }

    fun save() {
        val category = selected ?: return
        val cents = keypadBufferToCents(buffer)
        if (cents <= 0) return
        val txn = dataSource.addTransaction(category.id, cents, note = null)
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        scope.launch {
            val result = snackbarHostState.showSnackbar(
                message = "Saved ${formatMoney(cents)} · ${category.label}",
                actionLabel = "Undo",
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) {
                dataSource.deleteTransaction(txn.id)
            }
        }
        // Reset for the next entry — quick-add is used many times back to back.
        selected = null
        buffer = ""
    }

    val current = selected
    if (current == null) {
        Column(modifier = modifier.fillMaxSize().background(TallyColors.Ground)) {
            Text(
                text = "Add",
                style = TallyType.Title,
                color = TallyColors.Ink1,
                modifier = Modifier
                    .padding(start = 20.dp, top = 20.dp, bottom = 4.dp)
                    .semantics(mergeDescendants = false) { heading() },
            )
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(categories, key = { it.id }) { category ->
                    CategoryTile(category = category, onClick = { pickCategory(category) })
                }
            }
        }
    } else {
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(TallyColors.Ground)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .a11yRow(description = "Change category", onClick = ::backToGrid),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                TallyIcons.ChevronLeft(modifier = Modifier.size(20.dp))
                Text(text = "Change category", style = MaterialTheme.typography.labelLarge, color = TallyColors.Ink2)
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CategoryBadge(colorIndex = current.colorIndex, label = current.label, size = 48.dp)
                Column {
                    Text(text = current.label, style = MaterialTheme.typography.titleSmall, color = TallyColors.Ink1)
                    val typical = current.typicalAmountCents
                    Text(
                        text = if (typical != null) "Usual: ${formatMoney(typical)}" else "First time logging this one",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TallyColors.Ink2,
                    )
                }
            }

            val cents = keypadBufferToCents(buffer)
            Text(
                text = if (buffer.isNotEmpty()) formatMoney(cents) else formatMoney(0L),
                style = TallyType.MoneyHero,
                color = TallyColors.Ink1,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            QuickAddKeypad(
                onKey = { key -> buffer = applyKeypadKey(buffer, key) },
                disabledBackspace = buffer.isEmpty(),
            )

            Button(
                onClick = ::save,
                enabled = cents > 0,
                colors = ButtonDefaults.buttonColors(
                    containerColor = TallyColors.Accent,
                    contentColor = TallyColors.InkOnAccent,
                    disabledContainerColor = TallyColors.SurfaceSunk,
                    disabledContentColor = TallyColors.Ink3,
                ),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp),
            ) {
                Text(
                    text = if (cents > 0) "Save ${formatMoney(cents)}" else "Enter an amount",
                    style = MaterialTheme.typography.titleSmall,
                )
            }
        }
    }
}

@Composable
private fun CategoryTile(category: UiCategory, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 88.dp)
            .background(TallyColors.Surface, RoundedCornerShape(TallyCardRadius))
            .a11yRow(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CategoryBadge(colorIndex = category.colorIndex, label = category.label)
        Text(
            text = category.label,
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink1,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}
