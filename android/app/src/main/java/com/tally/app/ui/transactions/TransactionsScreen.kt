package com.tally.app.ui.transactions

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.CategoryBadge
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyEmptyState
import com.tally.app.ui.components.a11yClickable
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.model.Cents
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiDayGroup
import com.tally.app.ui.model.UiTxn
import com.tally.app.ui.model.computeRunningBalances
import com.tally.app.ui.model.filterTxns
import com.tally.app.ui.model.formatMonthLabel
import com.tally.app.ui.model.formatMoney
import com.tally.app.ui.model.formatRelativeDay
import com.tally.app.ui.model.formatTxnAmount
import com.tally.app.ui.model.groupTxnsByDay
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyControlRadius
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import java.time.YearMonth

/**
 * Transactions — CBA's account view (docs/DESIGN-V5.md section 1/section 3),
 * and also the existing all-accounts list Menu's "All transactions" row
 * already uses. Day-grouped with subtotals (unchanged from before this
 * build), searchable, and — when scoped to one [accountId] — each row
 * carries that account's running balance, the figure a bank statement
 * shows. The balance is computed by the pure [computeRunningBalances] (see
 * TransactionsTest for coverage), never inline in this composable, and from
 * the account's FULL transaction history rather than whatever the search
 * box currently matches — searching must never change what balance a
 * visible row reports, exactly like a real statement.
 *
 * KNOWN GAP (see this build's task report for the exact fix): [UiTxn.account]
 * is not yet populated by `ui/data` (`VaultTallyDataSource.toUiTxn` /
 * `DemoTallyDataSource`, both outside this package), so passing [accountId]
 * today always finds zero matching transactions. This composable renders
 * that honestly — docs/DESIGN-V5.md section 2's "nothing imported yet",
 * never a fabricated `$0.00` or an invented row — rather than silently
 * falling back to every account's transactions unlabelled.
 *
 * @param accountId one account's id (`money.AccountId.id`, e.g. `"amex"`) to
 *   scope this list to, or `null` for every account — the original
 *   behaviour, with no running balance shown (summing unrelated accounts
 *   into one running figure would be meaningless).
 * @param accountLabel the account's display name (e.g. `"Amex"`), used in
 *   the header and empty-state copy. The caller supplies this rather than
 *   this screen deriving it from [accountId] itself — an id-to-display-name
 *   map for `AccountId` already exists twice over (`ui/csvimport`,
 *   `ui/statements`); this screen deliberately does not add a third copy
 *   (docs/AGENT-BRIEF.md section 1's own warning about exactly that).
 * @param onOpenTxn called with a transaction's id when its row is tapped.
 *   The orchestrator wires this to `ui/txndetail`'s `TxnDetailScreen`.
 */
@Composable
fun TransactionsScreen(
    dataSource: TallyDataSource,
    accountId: String? = null,
    accountLabel: String? = null,
    modifier: Modifier = Modifier,
    onOpenTxn: (String) -> Unit = {},
) {
    val allTxns = dataSource.transactions.value
    val categories = dataSource.categories.value
    val categoryById = remember(categories) { categories.associateBy { it.id } }

    val scopedTxns = remember(allTxns, accountId) {
        if (accountId == null) allTxns else allTxns.filter { it.account == accountId }
    }

    var query by remember { mutableStateOf("") }
    var month by remember { mutableStateOf<YearMonth?>(null) } // null = "All time"

    val latestMonth = remember(scopedTxns) {
        scopedTxns.maxByOrNull { it.date }?.let { YearMonth.from(it.date) } ?: YearMonth.now()
    }

    fun goPrevMonth() {
        val base = month ?: latestMonth
        month = base.minusMonths(1)
    }

    fun goNextMonth() {
        val current = month ?: return // already "All time" — nothing further ahead
        val next = current.plusMonths(1)
        month = if (next.isAfter(YearMonth.now())) current else next
    }

    val nextDisabled = month == null || !month!!.isBefore(YearMonth.now())

    val filtered by remember(scopedTxns, query, month) {
        derivedStateOf { filterTxns(scopedTxns, query, month) }
    }
    val groups by remember(filtered) { derivedStateOf { groupTxnsByDay(filtered) } }

    // Balances reflect the account's FULL history, not the search/month-
    // filtered subset — see this composable's own doc comment.
    val balances = remember(scopedTxns, accountId) {
        if (accountId == null) emptyMap() else computeRunningBalances(scopedTxns)
    }

    Column(modifier = modifier.fillMaxSize().background(TallyColors.Ground)) {
        Text(
            text = accountLabel ?: "All transactions",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier
                .padding(start = 20.dp, top = 20.dp, bottom = 12.dp)
                .semantics(mergeDescendants = false) { heading() },
        )

        Column(
            modifier = Modifier.padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SearchField(query = query, onQueryChange = { query = it })

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                // The 48dp touch target and the 24dp glyph are two different
                // nodes (an outer Box, an inner Canvas) — a fixed `.size()`
                // and a minimum-size `.a11yClickable()` on the SAME node
                // would fight each other (the outer wins, the min is
                // clamped away), so the box carries the target and the icon
                // sits centred inside it at its own, smaller, fixed size.
                Box(
                    modifier = Modifier.a11yClickable(description = "Previous month", onClick = ::goPrevMonth),
                    contentAlignment = Alignment.Center,
                ) {
                    TallyIcons.ChevronLeft(tint = TallyColors.Ink2, modifier = Modifier.size(24.dp))
                }
                val label = month?.let(::formatMonthLabel) ?: "All time"
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleSmall,
                    color = TallyColors.Ink1,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .a11yClickable(
                            description = if (month != null) "Showing $label. Tap for all time" else "Showing all time",
                            onClick = { month = null },
                        ),
                )
                Box(
                    modifier = if (nextDisabled) {
                        Modifier.size(48.dp)
                    } else {
                        Modifier.a11yClickable(description = "Next month", onClick = ::goNextMonth)
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    TallyIcons.ChevronRight(
                        tint = if (nextDisabled) TallyColors.Ink3 else TallyColors.Ink2,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
        }

        when {
            scopedTxns.isEmpty() -> TallyEmptyState(
                headline = if (accountId != null) "Nothing imported yet" else "No transactions yet",
                body = if (accountId != null) {
                    "Transactions for ${accountLabel ?: "this account"} will show up here once they're imported or logged."
                } else {
                    "Log your first spend from the Add tab — it'll show up here, grouped by day."
                },
                modifier = Modifier.fillMaxWidth(),
            )
            filtered.isEmpty() -> Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                TallyEmptyState(
                    headline = "No matches",
                    body = "Try a different search or a different month.",
                    modifier = Modifier.fillMaxWidth(),
                )
                if (query.isNotEmpty()) {
                    Text(
                        text = "Clear search",
                        style = MaterialTheme.typography.labelLarge,
                        color = TallyColors.Accent,
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .a11yClickable(description = "Clear search", onClick = { query = "" }),
                    )
                }
            }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(top = 8.dp)) {
                groups.forEach { group ->
                    item(key = "header-${group.date}") {
                        DayHeader(group)
                    }
                    items(group.txns, key = { it.id }) { txn ->
                        TransactionRow(
                            txn = txn,
                            category = categoryById[txn.categoryId],
                            balanceCents = balances[txn.id],
                            onClick = { onOpenTxn(txn.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .background(TallyColors.SurfaceSunk, RoundedCornerShape(TallyControlRadius))
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TallyIcons.Search(modifier = Modifier.size(18.dp))
            Box(modifier = Modifier.fillMaxWidth()) {
                if (query.isEmpty()) {
                    Text(
                        text = "Search merchant, note or amount",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TallyColors.Ink3,
                    )
                }
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    textStyle = TallyType.Body.copy(color = TallyColors.Ink1),
                    cursorBrush = SolidColor(TallyColors.Ink1),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Search merchant, note or amount" },
                )
            }
        }
    }
}

@Composable
private fun DayHeader(group: UiDayGroup) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = formatRelativeDay(group.date), style = MaterialTheme.typography.labelMedium, color = TallyColors.Ink3)
        Text(text = formatTxnAmount(group.subtotalCents), style = MaterialTheme.typography.labelMedium, color = TallyColors.Ink3)
    }
}

/**
 * One row. Clickable via [a11yRow] — a real `Modifier.clickable`, so this is
 * reachable by keyboard/switch-access focus-and-activate, not the
 * web app's `role="button"` div with no key handler (docs/AGENT-BRIEF.md's
 * own warning about that exact mistake).
 */
@Composable
private fun TransactionRow(txn: UiTxn, category: UiCategory?, balanceCents: Cents?, onClick: () -> Unit) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .a11yRow(onClick = onClick)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CategoryBadge(colorIndex = category?.colorIndex ?: 0, label = category?.label ?: txn.merchant, size = 36.dp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(text = txn.merchant, style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
                val subtitle = listOfNotNull(category?.label, txn.note).joinToString(" · ")
                if (subtitle.isNotEmpty()) {
                    Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink2)
                }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = formatTxnAmount(txn.amountCents),
                    style = MaterialTheme.typography.bodyLarge,
                    color = TallyColors.Ink1,
                )
                if (balanceCents != null) {
                    Text(
                        text = "Bal ${formatMoney(balanceCents)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = TallyColors.Ink3,
                    )
                }
            }
        }
        TallyDivider(modifier = Modifier.padding(start = 20.dp))
    }
}
