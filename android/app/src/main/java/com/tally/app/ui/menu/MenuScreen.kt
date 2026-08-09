package com.tally.app.ui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.GlyphBadge
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import com.tally.app.ui.nav.Route
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType

private data class MenuLink(val glyph: String, val label: String, val subtitle: String, val route: Route)

// Menu — the third tab (DESIGN-V4.md §2). A plain labelled list of everything that
// isn't Home or quick-add. Section headings and row labels/subtitles are copied
// verbatim from `src/app/screens/MenuScreen.tsx` — do not reword without updating
// that source (or its successor, DESIGN-V4.md §2/§3) first.
private val MONEY_LINKS = listOf(
    MenuLink("A", "All transactions", "Every logged and imported spend", Route.Transactions),
    MenuLink("B", "Budgets", "Monthly caps by category", Route.Placeholder("Budgets", "Monthly caps by category")),
    MenuLink("R", "Regular payments", "Rent, subscriptions, bills", Route.Placeholder("Regular payments", "Rent, subscriptions, bills")),
    MenuLink("C", "Card balances", "What each card will bill you", Route.Placeholder("Card balances", "What each card will bill you")),
    MenuLink("S", "Spending patterns", "Month by month, the calendar, your habits", Route.Placeholder("Spending patterns", "Month by month, the calendar, your habits")),
)

private val SAVING_LINKS = listOf(
    MenuLink("$", "Deposit plan", "Progress toward the apartment deposit", Route.Placeholder("Deposit plan", "Progress toward the apartment deposit")),
    MenuLink("M", "Monthly routine", "Payday, transfer, the end-of-month check", Route.Placeholder("Monthly routine", "Payday, transfer, the end-of-month check")),
)

private val DATA_LINKS = listOf(
    MenuLink("I", "Import statements", "CBA, Amex or Bankwest CSV", Route.Placeholder("Import statements", "CBA, Amex or Bankwest CSV")),
    MenuLink("W", "Weekly catch-up", "Import, sort, confirm regular payments, pay Amex", Route.Placeholder("Weekly catch-up", "Import, sort, confirm regular payments, pay Amex")),
    MenuLink("B", "Backup & restore", "Save a copy, or restore one", Route.Placeholder("Backup & restore", "Save a copy, or restore one")),
)

private val APP_LINKS = listOf(
    MenuLink("?", "How Tally works", "The equation, plain English", Route.Placeholder("How Tally works", "The equation, plain English")),
    MenuLink("S", "Settings", "Income, categories, security", Route.Placeholder("Settings", "Income, categories, security")),
)

@Composable
fun MenuScreen(onNavigate: (Route) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = "Menu",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )

        MenuSection("Money", MONEY_LINKS, onNavigate)
        MenuSection("Saving", SAVING_LINKS, onNavigate)
        MenuSection("Data", DATA_LINKS, onNavigate)
        MenuSection("App", APP_LINKS, onNavigate)
    }
}

@Composable
private fun MenuSection(title: String, links: List<MenuLink>, onNavigate: (Route) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel(title)
        TallyListGroup {
            links.forEachIndexed { index, link ->
                if (index > 0) TallyDivider()
                TallyListRow(
                    title = link.label,
                    subtitle = link.subtitle,
                    leading = { GlyphBadge(glyph = link.glyph) },
                    chevron = true,
                    onClick = { onNavigate(link.route) },
                )
            }
        }
    }
}
