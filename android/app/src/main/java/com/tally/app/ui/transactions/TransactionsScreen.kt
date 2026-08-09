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
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.model.UiCategory
import com.tally.app.ui.model.UiDayGroup
import com.tally.app.ui.model.UiTxn
import com.tally.app.ui.model.filterTxns
import com.tally.app.ui.model.formatMonthLabel
import com.tally.app.ui.model.formatRelativeDay
import com.tally.app.ui.model.formatTxnAmount
import com.tally.app.ui.model.groupTxnsByDay
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyControlRadius
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import java.time.YearMonth

/**
 * All transactions — grouped by day with subtotals, search, and month
 * navigation. Backed by [LazyColumn] (not a plain scrolling `Column`) so
 * this stays smooth at thousands of rows, exactly the requirement that
 * ruled out anything else here.
 */
@Composable
fun TransactionsScreen(dataSource: TallyDataSource, modifier: Modifier = Modifier) {
    val allTxns = dataSource.transactions.value
    val categories = dataSource.categories.value
    val categoryById = remember(categories) { categories.associateBy { it.id } }

    var query by remember { mutableStateOf("") }
    var month by remember { mutableStateOf<YearMonth?>(null) } // null = "All time"

    val latestMonth = remember(allTxns) {
        allTxns.maxByOrNull { it.date }?.let { YearMonth.from(it.date) } ?: YearMonth.now()
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

    val filtered by remember(allTxns, query, month) {
        derivedStateOf { filterTxns(allTxns, query, month) }
    }
    val groups by remember(filtered) { derivedStateOf { groupTxnsByDay(filtered) } }

    Column(modifier = modifier.fillMaxSize().background(TallyColors.Ground)) {
        Text(
            text = "All transactions",
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

        if (allTxns.isEmpty()) {
            TallyEmptyState(
                headline = "No transactions yet",
                body = "Log your first spend from the Add tab — it'll show up here, grouped by day.",
                modifier = Modifier.fillMaxWidth(),
            )
        } else if (filtered.isEmpty()) {
            TallyEmptyState(
                headline = "No matches",
                body = "Try a different search or a different month.",
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(top = 8.dp)) {
                groups.forEach { group ->
                    item(key = "header-${group.date}") {
                        DayHeader(group)
                    }
                    items(group.txns, key = { it.id }) { txn ->
                        TransactionRow(txn = txn, category = categoryById[txn.categoryId])
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
                        text = "Search merchant or note",
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
                        .semantics { contentDescription = "Search merchant or note" },
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

@Composable
private fun TransactionRow(txn: UiTxn, category: UiCategory?) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
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
            Text(
                text = formatTxnAmount(txn.amountCents),
                style = MaterialTheme.typography.bodyLarge,
                color = TallyColors.Ink1,
            )
        }
        TallyDivider(modifier = Modifier.padding(start = 20.dp))
    }
}
