package com.tally.app.ui.txndetail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyEmptyState
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

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
 * WHAT ACTUALLY WRITES, AND WHAT DOESN'T
 * ---------------------------------------
 * - **Delete** is fully wired: `TallyDataSource.deleteTransaction` already
 *   exists, so the confirm dialog below calls it for real.
 * - **Change category**, **edit note** and **exclude toggle** are NOT wired.
 *   `TallyDataSource` has no update method — only `addTransaction` and
 *   `deleteTransaction` exist (see this file's own task report for the
 *   exact signature this screen needs added). Per the task brief: "do not
 *   invent [a write path] and do not write directly to VaultRepository from
 *   a composable... leave the control disabled with a comment saying why."
 *   All three controls below render the REAL current value (never invented
 *   data) but cannot be edited yet — each is `enabled = false`, and one
 *   line under them says so once, plainly, rather than nagging per field.
 */
@Composable
fun TxnDetailScreen(
    dataSource: TallyDataSource,
    txnId: String,
    modifier: Modifier = Modifier,
    accountLabel: String? = null,
    onBack: () -> Unit = {},
) {
    val txn = dataSource.transactions.value.find { it.id == txnId }
    val category = txn?.let { t -> dataSource.categories.value.find { it.id == t.categoryId } }
    val scope = rememberCoroutineScope()
    var confirmingDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

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

            MoneyText(
                cents = txn.amountCents,
                showSign = true,
                fontSize = 32.sp,
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
                val account = accountDisplayText(accountLabel, txn.account)
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
            // prominent even though it can't be changed yet, so the intended
            // design reads correctly once a write path exists.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp)
                    .background(TallyColors.Surface, RoundedCornerShape(TallyCardRadius))
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CategoryBadge(colorIndex = category?.colorIndex ?: 0, label = category?.label ?: txn.merchant, size = 44.dp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = category?.label ?: "Uncategorised", style = MaterialTheme.typography.titleSmall, color = TallyColors.Ink1)
                }
                // No onClick: not a fake-working control. See this file's
                // own doc comment for exactly what's missing.
                Text(text = "Change", style = MaterialTheme.typography.labelLarge, color = TallyColors.Ink3)
            }

            TallySectionLabel("Note")
            if (txn.note.isNullOrBlank()) {
                Text(text = "No note", style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink3, modifier = Modifier.padding(horizontal = 4.dp))
            } else {
                OutlinedTextField(
                    value = txn.note,
                    onValueChange = {},
                    enabled = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            TallyListGroup {
                TallyListRow(
                    title = "Exclude from budget",
                    subtitle = "Keeps this transaction out of monthly totals and insights.",
                    trailing = { Switch(checked = txn.excluded, enabled = false, onCheckedChange = {}) },
                )
            }

            Text(
                text = "Category, the note and the exclude toggle can't be edited yet — see this build's task report for the one method that's missing. Delete works.",
                style = MaterialTheme.typography.labelMedium,
                color = TallyColors.Ink3,
            )

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
 * The account line's display text: prefer the caller-supplied [accountLabel]
 * (a real display name, e.g. `"Amex"`, resolved by whoever knows the
 * `AccountId` -> label mapping — see `TxnDetailScreen`'s own parameter doc),
 * fall back to the raw [accountId] when only that is known, and render
 * nothing when neither is available rather than an empty "Account" row.
 * Pure, see TxnDetailScreenTest.
 */
internal fun accountDisplayText(accountLabel: String?, accountId: String?): String? =
    accountLabel?.takeIf { it.isNotBlank() } ?: accountId?.takeIf { it.isNotBlank() }
