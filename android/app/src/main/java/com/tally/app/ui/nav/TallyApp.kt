package com.tally.app.ui.nav

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.data.rememberDemoDataSource
import com.tally.app.ui.home.HomeScreen
import com.tally.app.ui.menu.MenuScreen
import com.tally.app.ui.menu.PlaceholderScreen
import com.tally.app.ui.quickadd.QuickAddScreen
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.transactions.TransactionsScreen

/**
 * The app shell: three-tab bottom navigation (Home · ⊕ · Menu) over a
 * hand-managed back stack (see `Route.kt` for why this isn't
 * `navigation-compose`). Every screen under `com.tally.app.ui` is wired
 * together here, against the single [TallyDataSource] seam — swap
 * `rememberDemoDataSource()` for a real implementation and nothing else in
 * this file, or in any screen, needs to change.
 */
@Composable
fun TallyApp(dataSource: TallyDataSource = rememberDemoDataSource()) {
    val backStack = remember { mutableStateListOf<Route>(Route.Home) }
    val current = backStack.last()
    val rootTab = backStack.first()
    val snackbarHostState = remember { SnackbarHostState() }

    BackHandler(enabled = backStack.size > 1) {
        backStack.removeAt(backStack.lastIndex)
    }

    fun switchTab(route: Route) {
        backStack.clear()
        backStack.add(route)
    }

    fun push(route: Route) {
        backStack.add(route)
    }

    fun popOne() {
        if (backStack.size > 1) backStack.removeAt(backStack.lastIndex)
    }

    Scaffold(
        containerColor = TallyColors.Ground,
        bottomBar = { TallyBottomBar(rootTab = rootTab, onSelectTab = ::switchTab) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (val route = current) {
                is Route.Home -> HomeScreen(
                    dataSource = dataSource,
                    onOpenDepositPlan = {
                        push(Route.Placeholder("Deposit plan", "Progress toward the apartment deposit"))
                    },
                    onOpenToSortOutItem = { item -> push(Route.Placeholder(item.title, item.subtitle)) },
                )
                is Route.QuickAdd -> QuickAddScreen(dataSource = dataSource, snackbarHostState = snackbarHostState)
                is Route.Menu -> MenuScreen(onNavigate = ::push)
                is Route.Transactions -> TransactionsScreen(dataSource = dataSource)
                is Route.Placeholder -> PlaceholderScreen(
                    title = route.title,
                    subtitle = route.subtitle,
                    onBack = ::popOne,
                )
            }
        }
    }
}

@Composable
private fun TallyBottomBar(rootTab: Route, onSelectTab: (Route) -> Unit) {
    NavigationBar(containerColor = TallyColors.Surface, contentColor = TallyColors.Ink2) {
        val colors = NavigationBarItemDefaults.colors(
            selectedIconColor = TallyColors.Accent,
            selectedTextColor = TallyColors.Accent,
            indicatorColor = TallyColors.AccentTint,
            unselectedIconColor = TallyColors.Ink3,
            unselectedTextColor = TallyColors.Ink3,
        )

        val homeSelected = rootTab is Route.Home
        NavigationBarItem(
            selected = homeSelected,
            onClick = { onSelectTab(Route.Home) },
            icon = {
                TallyIcons.Home(
                    modifier = Modifier.size(24.dp),
                    tint = if (homeSelected) TallyColors.Accent else TallyColors.Ink3,
                )
            },
            label = { Text("Home", style = MaterialTheme.typography.labelMedium) },
            colors = colors,
        )

        val addSelected = rootTab is Route.QuickAdd
        NavigationBarItem(
            selected = addSelected,
            onClick = { onSelectTab(Route.QuickAdd) },
            icon = {
                TallyIcons.Add(
                    modifier = Modifier.size(24.dp),
                    tint = if (addSelected) TallyColors.Accent else TallyColors.Ink3,
                )
            },
            label = { Text("Add", style = MaterialTheme.typography.labelMedium) },
            colors = colors,
        )

        val menuSelected = rootTab is Route.Menu
        NavigationBarItem(
            selected = menuSelected,
            onClick = { onSelectTab(Route.Menu) },
            icon = {
                TallyIcons.Menu(
                    modifier = Modifier.size(24.dp),
                    tint = if (menuSelected) TallyColors.Accent else TallyColors.Ink3,
                )
            },
            label = { Text("Menu", style = MaterialTheme.typography.labelMedium) },
            colors = colors,
        )
    }
}
