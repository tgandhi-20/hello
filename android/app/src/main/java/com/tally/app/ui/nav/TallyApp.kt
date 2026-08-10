package com.tally.app.ui.nav

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tally.app.data.VaultRepository
import com.tally.app.ui.data.TallyDataSource
import com.tally.app.ui.data.VaultLockState
import com.tally.app.ui.data.VaultTallyDataSource
import com.tally.app.ui.home.HomeScreen
import com.tally.app.ui.lock.LockScreen
import com.tally.app.ui.menu.MenuScreen
import com.tally.app.ui.menu.PlaceholderScreen
import com.tally.app.ui.quickadd.QuickAddScreen
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.transactions.TransactionsScreen
import kotlinx.coroutines.launch
import com.tally.app.ui.budgets.BudgetsScreen
import com.tally.app.ui.goal.GoalScreen
import com.tally.app.ui.recurring.RecurringScreen
import com.tally.app.ui.csvimport.CsvImportScreen
import com.tally.app.ui.statements.StatementsScreen
import com.tally.app.ui.capture.CaptureReviewRoute
import com.tally.app.ui.capture.NotificationAccessRoute
import com.tally.app.ui.settings.SettingsScreen

/**
 * Production entry point (called from `MainActivity`) — gates the whole app
 * shell on the vault's lock state before anything real is ever shown.
 *
 * `dataSource` is owned by the caller (`MainActivity`), not constructed
 * here, so the same instance survives across this composable's own
 * recompositions and the Activity's `onStart`/`onStop` lifecycle callbacks
 * can reach it directly to sync [VaultTallyDataSource.onLocked] after
 * auto-lock fires (see `VaultRepository.autoLock`'s wiring in
 * `MainActivity`).
 *
 * `checkedInitialState` exists so a freshly-recreated Activity (e.g. after
 * rotation, where the vault key survived in [com.tally.app.security.VaultKeyHolder]
 * but this particular [VaultTallyDataSource] did not) re-hydrates before
 * ever showing either the lock screen or stale/empty data.
 */
@Composable
fun TallyAppRoot(repository: VaultRepository, dataSource: VaultTallyDataSource) {
    val scope = rememberCoroutineScope()
    var checkedInitialState by remember { mutableStateOf(false) }

    LaunchedEffect(repository, dataSource) {
        if (repository.isUnlocked()) {
            dataSource.onUnlocked()
        }
        checkedInitialState = true
    }

    when {
        !checkedInitialState -> Box(
            modifier = Modifier.fillMaxSize().background(TallyColors.Ground),
        )
        dataSource.lockState.value == VaultLockState.LOCKED -> LockScreen(
            repository = repository,
            onUnlocked = { scope.launch { dataSource.onUnlocked() } },
        )
        else -> TallyApp(repository = repository, dataSource = dataSource)
    }
}

/**
 * The app shell: three-tab bottom navigation (Home · ⊕ · Menu) over a
 * hand-managed back stack (see `Route.kt` for why this isn't
 * `navigation-compose`). Every screen under `com.tally.app.ui` is wired
 * together here, against the single [TallyDataSource] seam. Reached only
 * once the vault is unlocked — see [TallyAppRoot] for the real, lock-gated
 * production entry point.
 *
 * [dataSource] is deliberately REQUIRED rather than defaulting to the demo
 * source. A default meant `TallyApp()` compiled fine and rendered a
 * confident, well-laid-out screen full of invented money, which is exactly
 * how this app spent its first build: `MainActivity` called the no-arg form
 * and nobody could tell from the screen that nothing was real. This project
 * has now shipped built-but-never-wired code three times, so the failure
 * mode gets closed off at the type level instead of being documented.
 * Previews and tests pass `rememberDemoDataSource()` explicitly — one extra
 * argument in the few places that genuinely want fake data, and no way to
 * get it by accident anywhere else.
 */
@Composable
fun TallyApp(repository: VaultRepository, dataSource: VaultTallyDataSource) {
    val backStack = remember { mutableStateListOf<Route>(Route.Home) }
    val current = backStack.last()
    val rootTab = backStack.first()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

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
                    onOpenDepositPlan = { push(Route.Goal) },
                    onOpenToSortOutItem = { item -> push(Route.Placeholder(item.title, item.subtitle)) },
                )
                is Route.QuickAdd -> QuickAddScreen(dataSource = dataSource, snackbarHostState = snackbarHostState)
                is Route.Menu -> MenuScreen(onNavigate = ::push)
                is Route.Transactions -> TransactionsScreen(dataSource = dataSource)

                is Route.Budgets -> BudgetsScreen(dataSource = dataSource, onBack = ::popOne)

                // Goal and Recurring take domain types rather than Ui shapes,
                // because they need fields the Ui model does not carry — most
                // importantly whether the deposit balance is the user's real
                // one or the projection standing in for it. Both still read
                // from the single computed result, so nothing here is a second
                // source of truth.
                is Route.Goal -> {
                    val progress = dataSource.savingsProgress.value
                    if (progress == null) {
                        // Not hydrated yet. Render nothing rather than a zeroed
                        // plan, which would read as "you have saved nothing".
                        Box(modifier = Modifier.fillMaxSize())
                    } else {
                        GoalScreen(
                            savingsProgress = progress,
                            onSaveActualBalance = { cents ->
                                scope.launch { dataSource.setGoalActualBalance(cents) }
                            },
                            onBack = ::popOne,
                        )
                    }
                }

                is Route.Recurring -> RecurringScreen(
                    series = dataSource.recurringSeries.value,
                    onConfirm = { series ->
                        scope.launch { dataSource.updateRecurringSeries(series.copy(confirmed = true)) }
                    },
                    onToggleMuted = { series ->
                        scope.launch { dataSource.updateRecurringSeries(series.copy(muted = !series.muted)) }
                    },
                    onBack = ::popOne,
                )

                is Route.CsvImport -> CsvImportScreen(
                    repository = repository,
                    onBack = {
                        // An import writes straight through the repository, so
                        // the cached figures are stale the moment it succeeds.
                        // Re-hydrate on the way back rather than letting Home
                        // show a total that predates the import.
                        scope.launch { dataSource.onUnlocked() }
                        popOne()
                    },
                )

                is Route.Statements -> StatementsScreen(repository = repository, onBack = ::popOne)

                is Route.CaptureReview -> CaptureReviewRoute(
                    repository = repository,
                    onBack = {
                        // Same reasoning as import: accepting a capture writes
                        // through the repository, not through this data source.
                        scope.launch { dataSource.onUnlocked() }
                        popOne()
                    },
                )

                is Route.NotificationAccess -> NotificationAccessRoute(onBack = ::popOne)

                is Route.Settings -> SettingsScreen(
                    repository = repository,
                    onBack = ::popOne,
                    // Restore, erase and PIN change replace the vault wholesale,
                    // so nothing cached can be trusted afterwards.
                    onVaultChanged = { scope.launch { dataSource.onUnlocked() } },
                )

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
