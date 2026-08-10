package com.tally.app.ui.statements

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tally.app.data.VaultRepository
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.a11yClickable
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Statements — per account, when it was last imported from a CSV and what
 * still hasn't been. CSV import is the source of truth for the ledger
 * (docs/ANDROID-NATIVE.md); this screen exists so the user's own Saturday
 * routine (docs/PERSONAL.md §8) doesn't have to live in their memory.
 *
 * Read-only: this screen never writes to the vault, only reads via
 * [VaultRepository.hydrateAll].
 */
@Composable
fun StatementsScreen(
    repository: VaultRepository,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var state by remember { mutableStateOf<StatementsUiState>(StatementsUiState.Loading) }

    LaunchedEffect(Unit) {
        state = loadStatementsState(repository)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        StatementsHeader(onBack = onBack)
        when (val s = state) {
            is StatementsUiState.Loading -> LoadingBody()
            is StatementsUiState.Failure -> FailureBody(message = s.message)
            is StatementsUiState.Loaded -> LoadedBody(s)
        }
    }
}

// ---------------------------------------------------------------------------
// State + loading.
// ---------------------------------------------------------------------------

private sealed class StatementsUiState {
    data object Loading : StatementsUiState()
    data class Failure(val message: String) : StatementsUiState()
    data class Loaded(
        val statuses: List<AccountStatementStatus>,
        val paydayDayOfMonth: Int,
        val nextStatementDay: LocalDate,
        val skippedRecordCount: Int,
    ) : StatementsUiState()
}

private suspend fun loadStatementsState(repository: VaultRepository): StatementsUiState {
    return withContext(Dispatchers.IO) {
        val hydrate = try {
            repository.hydrateAll()
        } catch (e: IllegalStateException) {
            return@withContext StatementsUiState.Failure("Tally is locked. Go back and unlock to see statement status.")
        } catch (e: Exception) {
            return@withContext StatementsUiState.Failure("Couldn't read your ledger — please try again.")
        }
        val today = LocalDate.now()
        StatementsUiState.Loaded(
            statuses = buildStatementStatuses(hydrate.txns, today),
            paydayDayOfMonth = hydrate.settings.paydayDayOfMonth,
            nextStatementDay = nextStatementDay(today),
            skippedRecordCount = hydrate.skippedRecordCount,
        )
    }
}

// ---------------------------------------------------------------------------
// UI pieces.
// ---------------------------------------------------------------------------

private val DAY_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.Builder().setLanguage("en").setRegion("AU").build())

@Composable
private fun StatementsHeader(onBack: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.padding(start = 8.dp, top = 20.dp, bottom = 4.dp),
    ) {
        Box(
            modifier = Modifier.a11yClickable(description = "Back", onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            TallyIcons.ChevronLeft(modifier = Modifier.size(22.dp))
        }
        Text(
            text = "Statements",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )
    }
}

@Composable
private fun LoadingBody() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator(color = TallyColors.Accent)
    }
}

@Composable
private fun FailureBody(message: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 32.dp)) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = TallyColors.Ink1,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun LoadedBody(state: StatementsUiState.Loaded) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // --- The routine, in plain words ---
        SectionLabel("The routine")
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(TallyColors.Surface, RoundedCornerShape(TallyCardRadius))
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "Salary lands on day ${state.paydayDayOfMonth} of the month. " +
                        "The first Saturday of each month is statement day — export CSVs from CBA, Bankwest and Amex, " +
                        "and pay the Amex balance in full (23.99% interest otherwise).",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TallyColors.Ink2,
                )
                Text(
                    text = "Next statement day: ${DAY_MONTH.format(state.nextStatementDay)}",
                    style = MaterialTheme.typography.labelLarge,
                    color = TallyColors.Ink1,
                )
            }
        }

        // --- Per-account status ---
        SectionLabel("Accounts")
        TallyListGroup {
            state.statuses.forEachIndexed { index, status ->
                AccountStatementRow(status)
                if (index != state.statuses.lastIndex) TallyDivider(modifier = Modifier.padding(start = 16.dp))
            }
        }

        if (state.skippedRecordCount > 0) {
            Text(
                text = "${state.skippedRecordCount} record${if (state.skippedRecordCount == 1) "" else "s"} in your ledger " +
                    "could not be read and ${if (state.skippedRecordCount == 1) "was" else "were"} skipped — this may affect the dates above.",
                style = MaterialTheme.typography.bodyMedium,
                color = TallyColors.Caution,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

@Composable
private fun AccountStatementRow(status: AccountStatementStatus) {
    val lastImported = status.lastImportedThrough
    val days = status.daysSinceLastImport
    val subtitle = if (lastImported == null) {
        "No CSV imported yet"
    } else {
        val dayWord = when {
            days == null -> ""
            days <= 0 -> "today"
            days == 1 -> "1 day ago"
            else -> "$days days ago"
        }
        "Imported through ${DAY_MONTH.format(lastImported)} · $dayWord"
    }
    TallyListRow(title = accountDisplayName(status.account), subtitle = subtitle)
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = TallyColors.Ink2,
        modifier = Modifier.padding(horizontal = 4.dp),
    )
}
