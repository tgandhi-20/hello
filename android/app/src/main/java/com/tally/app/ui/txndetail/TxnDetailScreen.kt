package com.tally.app.ui.txndetail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tally.app.ui.components.CategoryBadge
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyEmptyState
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.money.AccountId
import com.tally.app.ui.model.formatTxnAmount
import com.tally.app.ui.statements.accountDisplayName
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import androidx.compose.ui.focus.onFocusChanged
import com.tally.app.ui.components.a11yClickable
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiTxn

/**
 * Transaction detail — reached by tapping a row in
 * `ui/transactions.TransactionsScreen` (docs/DESIGN-V5.md section 3: "Txn:
 * detail: category, note, exclude, delete"). Rendered as a normal pushed
 * screen rather than a real `ModalBottomSheet` — there is no existing
 * `ModalBottomSheet` call site anywhere in this tree to verify the API
 * against (docs/AGENT-BRIEF.md section 0: "every API signature must match
 * something already used in this tree"), and the task brief says a sheet is
 * *fine*, not required. The orchestrator is free to present this behind a
 * sheet-shaped container at the nav layer without anything here changing.
 *
 * WHAT WRITES
 * -----------
 * All four controls are live. Category, note and exclude were built disabled,
 * because `TallyDataSource` had no update method and the alternative was a
 * composable writing straight to `VaultRepository` — a second write path that
 * bypasses the single recompute, so nothing on Home would have moved when you
 * re-categorised something. `updateTransaction` now exists and every edit goes
 * through it.
 *
 * Each edit re-runs the money engine, which is the point: re-categorising
 * moves money between category rows and excluding removes it from spent
 * entirely, so the equation on Home has to change with it. That is also why
 * the note commits on focus loss rather than per keystroke — a write per
 * character would recompute the whole ledger while you type.
 */
@Composable
fun TxnDetailScreen(
    dataSource: TallyDataSource,
    txnId: String,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    val txn = dataSource.transactions.value.find { it.id == txnId }
    val category = txn?.let { t -> dataSource.categories.value.find { it.id == t.categoryId } }
    val scope = rememberCoroutineScope()
    var confirmingDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var pickingCategory by remember { mutableStateOf(false) }
    // The note is edited locally and written on blur/done rather than on every
    // keystroke: each write re-runs the money engine, and doing that per
    // character would recompute the whole ledger while someone types.
    var noteDraft by remember(txnId, txn?.note) { mutableStateOf(txn?.note.orEmpty()) }

    fun save(patch: (UiTxn) -> UiTxn) {
        scope.launch { dataSource.updateTransaction(txnId, patch) }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        BackHeader(onBack = onBack)

        if (txn == null) {
            // The transaction was deleted (e.g. from another entry point)
            // between the list rendering and this screen opening, or a
            // stale id was passed in. Render the honest empty state, never
            // a form full of blanks that looks like a real transaction.
            TallyEmptyState(
                headline = "Not available",
                body = "This transaction isn't there anymore.",
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Text(
                text = txn.merchant,
                style = TallyType.Title,
                color = TallyColors.Ink1,
                modifier = Modifier.semantics(mergeDescendants = false) { heading() },
            )

            // formatTxnAmount, not a raw MoneyText(showSign = true): that flag
            // means "put a + on any positive figure", but this app's sign
            // convention is the opposite of what that reads as here — positive
            // amountCents is a SPEND (ui/model/Money.kt), which must render
            // plain, never "+"-prefixed like an inflow.
            Text(
                text = formatTxnAmount(txn.amountCents),
                style = TallyType.Money.copy(fontSize = 32.sp),
                color = TallyColors.Ink1,
                modifier = Modifier.fillMaxWidth(),
            )

            TallyListGroup {
                TallyListRow(
                    title = "Date",
                    trailing = {
                        Text(formatDetailDate(txn.date), style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
                    },
                )
                val account = accountDisplayText(txn.account)
                if (account != null) {
                    TallyDivider(modifier = Modifier.padding(start = 16.dp))
                    TallyListRow(
                        title = "Account",
                        trailing = {
                            Text(account, style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
                        },
                    )
                }
            }

            TallySectionLabel("Category")
            // The single most common correction (task brief) — kept visually
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TallyColors.Surface, RoundedCornerShape(TallyCardRadius))
                    .a11yClickable(description = "Change category") { pickingCategory = true }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CategoryBadge(colorIndex = category?.colorIndex ?: 0, label = category?.label ?: txn.merchant, size = 44.dp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = category?.label ?: "Uncategorised", style = MaterialTheme.typography.titleSmall, color = TallyColors.Ink1)
                }
                Text(text = "Change", style = MaterialTheme.typography.labelLarge, color = TallyColors.Accent)
            }

            if (pickingCategory) {
                CategoryPickerDialog(
                    categories = dataSource.categories.value,
                    selectedId = txn.categoryId,
                    onDismiss = { pickingCategory = false },
                    onPick = { id ->
                        pickingCategory = false
                        save { it.copy(categoryId = id) }
                    },
                )
            }

            TallySectionLabel("Note")
            OutlinedTextField(
                value = noteDraft,
                onValueChange = { noteDraft = it },
                singleLine = false,
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { focus ->
                        // Commit when focus leaves, not per keystroke — every
                        // write re-runs the money engine over the whole ledger.
                        if (!focus.isFocused) {
                            val trimmed = noteDraft.trim().ifBlank { null }
                            if (trimmed != txn.note) save { it.copy(note = trimmed) }
                        }
                    },
            )

            TallyListGroup {
                TallyListRow(
                    title = "Exclude from budget",
                    subtitle = "Keeps this transaction out of monthly totals and insights.",
                    trailing = {
                        Switch(
                            checked = txn.excluded,
                            onCheckedChange = { on -> save { it.copy(excluded = on) } },
                        )
                    },
                )
            }

            Button(
                onClick = { confirmingDelete = true },
                enabled = !deleting,
                colors = ButtonDefaults.buttonColors(containerColor = TallyColors.Critical, contentColor = TallyColors.InkOnAccent),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp),
            ) {
                Text("Delete transaction")
            }
        }
    }

    if (confirmingDelete && txn != null) {
        AlertDialog(
            onDismissRequest = { if (!deleting) confirmingDelete = false },
            title = { Text("Delete this transaction?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        deleting = true
                        val id = txn.id
                        scope.launch {
                            dataSource.deleteTransaction(id)
                            deleting = false
                            confirmingDelete = false
                            onBack()
                        }
                    },
                    enabled = !deleting,
                    colors = ButtonDefaults.buttonColors(containerColor = TallyColors.Critical, contentColor = TallyColors.InkOnAccent),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { if (!deleting) confirmingDelete = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun BackHeader(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .a11yRow(description = "Back", onClick = onBack),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TallyIcons.ChevronLeft(modifier = Modifier.size(20.dp))
        Text(text = "Back", style = MaterialTheme.typography.labelLarge, color = TallyColors.Ink2)
    }
}

private val DETAIL_DATE_FORMAT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM yyyy", Locale.Builder().setLanguage("en").setRegion("AU").build())

/** `"12 Aug 2026"` — pure, no data-source access, see TxnDetailScreenTest. */
internal fun formatDetailDate(date: LocalDate): String = DETAIL_DATE_FORMAT.format(date)

/**
 * The account line's display text: resolve [rawAccountId] (`UiTxn.account`,
 * a plain `AccountId.id` string) to its real display name via `ui/statements`'s
 * existing `accountDisplayName` — the same id-to-label map `ui/accounts`
 * itself now reuses, not a third copy (docs/AGENT-BRIEF.md section 1's own
 * warning about exactly that duplication). Falls back to the raw id if it
 * doesn't resolve to a known [AccountId] (defensive only — every id that
 * ever reaches [UiTxn.account] comes from [AccountId.id] in the first
 * place), and to `null` — never an empty "Account" row — when there is no
 * id at all. Pure, see TxnDetailScreenTest.
 */
internal fun accountDisplayText(rawAccountId: String?): String? {
    val id = rawAccountId?.takeIf { it.isNotBlank() } ?: return null
    return AccountId.fromId(id)?.let(::accountDisplayName) ?: id
}

/**
 * Pick a category for a transaction.
 *
 * Re-categorising is the correction people make most often — a coffee filed
 * as groceries, a one-off filed as a subscription — so it is one tap from the
 * transaction and one more to change. The current category is marked rather
 * than merely pre-scrolled to, because "which one is it now" is the first
 * question you have when this opens.
 */
@Composable
private fun CategoryPickerDialog(
    categories: List<UiCategory>,
    selectedId: String,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Category") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                categories.forEach { c ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .a11yClickable(description = c.label) { onPick(c.id) }
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CategoryBadge(colorIndex = c.colorIndex, label = c.label, size = 32.dp)
                        Text(
                            text = c.label,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TallyColors.Ink1,
                            modifier = Modifier.weight(1f),
                        )
                        if (c.id == selectedId) {
                            Text(
                                text = "Current",
                                style = MaterialTheme.typography.labelMedium,
                                color = TallyColors.Accent,
                            )
                        }
                    }
                }
            }
        },
    )
}
