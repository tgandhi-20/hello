package com.tally.app.ui.csvimport

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tally.app.csvimport.CsvAnalysis
import com.tally.app.csvimport.SignMethod
import com.tally.app.csvimport.analyzeCsv
import com.tally.app.data.VaultRepository
import com.tally.app.money.AccountId
import com.tally.app.ui.components.CategoryBadge
import com.tally.app.ui.components.GlyphBadge
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.a11yRow
import com.tally.app.ui.model.formatRelativeDay
import com.tally.app.ui.model.formatTxnAmount
import com.tally.app.ui.theme.TallyCardRadius
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyIcons
import com.tally.app.ui.theme.TallyType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * CSV statement import — the source of truth for the ledger (docs/ANDROID-NATIVE.md,
 * capture is a convenience; this is not). Pick a file via the Storage Access
 * Framework, see exactly what the parser decided and why, choose the account,
 * review every row, and only then commit through [VaultRepository.addTxns] —
 * the batch method, never a loop (AGENT-BRIEF.md §3).
 *
 * Nothing is written to the ledger until [CsvImportUiState.Review.preview]'s
 * rows are handed to [VaultRepository.addTxns] from the confirm button below.
 */
@Composable
fun CsvImportScreen(
    repository: VaultRepository,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var uiState by remember { mutableStateOf<CsvImportUiState>(CsvImportUiState.PickFile) }

    val pickLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            uiState = CsvImportUiState.Loading
            scope.launch {
                uiState = loadAndAnalyze(context, repository, uri)
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        ImportHeader(onBack = onBack)

        when (val state = uiState) {
            is CsvImportUiState.PickFile -> PickFileBody(
                onPick = {
                    pickLauncher.launch(
                        arrayOf("text/csv", "text/comma-separated-values", "text/plain", "application/octet-stream"),
                    )
                },
            )

            is CsvImportUiState.Loading -> LoadingBody(message = "Reading file…")

            is CsvImportUiState.Failure -> FailureBody(
                message = state.message,
                onRetry = { uiState = CsvImportUiState.PickFile },
            )

            is CsvImportUiState.Review -> ReviewBody(
                state = state,
                onAccountChange = { newAccount ->
                    uiState = CsvImportUiState.Loading
                    scope.launch {
                        uiState = withContext(Dispatchers.Default) {
                            recomputeReview(state, account = newAccount, signInverted = state.signInverted, signOverridden = state.signOverridden)
                        }
                    }
                },
                onSignToggle = {
                    val newSign = !state.signInverted
                    uiState = CsvImportUiState.Loading
                    scope.launch {
                        uiState = withContext(Dispatchers.Default) {
                            recomputeReview(state, account = state.account, signInverted = newSign, signOverridden = true)
                        }
                    }
                },
                onCancel = { uiState = CsvImportUiState.PickFile },
                onConfirm = {
                    uiState = CsvImportUiState.Committing
                    scope.launch {
                        val (added, skipped) = withContext(Dispatchers.IO) {
                            repository.addTxns(state.preview.rows, state.existingHashes)
                        }
                        uiState = CsvImportUiState.Committed(added.size, skipped)
                    }
                },
            )

            is CsvImportUiState.Committing -> LoadingBody(message = "Saving…")

            is CsvImportUiState.Committed -> CommittedBody(
                added = state.added,
                skipped = state.skipped,
                onImportAnother = { uiState = CsvImportUiState.PickFile },
                onDone = onBack,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// File loading — SAF read, sanity checks, parse, hydrate, first preview.
// Never logs file content or the exception message (docs/ANDROID-NATIVE.md §3:
// never log financial data — a CSV of bank transactions is exactly that).
// ---------------------------------------------------------------------------

private suspend fun loadAndAnalyze(context: Context, repository: VaultRepository, uri: Uri): CsvImportUiState {
    return withContext(Dispatchers.IO) {
        val bytes = try {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: Exception) {
            null
        }

        if (bytes == null) {
            return@withContext CsvImportUiState.Failure(
                "Couldn't open this file. It may have been moved, deleted, or this app wasn't given permission to read it — try picking it again.",
            )
        }
        if (bytes.isEmpty()) {
            return@withContext CsvImportUiState.Failure("This file is empty — there's nothing to import.")
        }
        if (looksBinary(bytes)) {
            return@withContext CsvImportUiState.Failure(
                "This doesn't look like a CSV or text file. Export a CSV (not a PDF or app-specific format) from your bank and try again.",
            )
        }

        val text = String(bytes, Charsets.UTF_8).removePrefix("﻿")
        if (text.isBlank()) {
            return@withContext CsvImportUiState.Failure("This file is empty — there's nothing to import.")
        }

        val analysis: CsvAnalysis = try {
            analyzeCsv(text)
        } catch (e: Exception) {
            return@withContext CsvImportUiState.Failure(
                "Couldn't read this file as CSV. Check it exported correctly from your bank and try again.",
            )
        }

        if (analysis.rawCsv.rows.isEmpty()) {
            return@withContext CsvImportUiState.Failure("This file has no data rows to import.")
        }

        val hydrate = try {
            repository.hydrateAll()
        } catch (e: IllegalStateException) {
            return@withContext CsvImportUiState.Failure("Tally is locked. Go back and unlock before importing.")
        } catch (e: Exception) {
            return@withContext CsvImportUiState.Failure("Couldn't read your existing ledger to check for duplicates — please try again.")
        }

        val account = analysis.formatDetection.accountGuess
        val signInverted = analysis.signAnalysis.signInverted
        val existingHashes = hydrate.txns.map { it.hash }.toSet()

        val preview = buildPreviewFor(analysis, account, signInverted, hydrate.rules, hydrate.categories, existingHashes)
        val failureMessage = previewFailureMessage(preview, analysis.layout.dataRows.size)
        if (failureMessage != null) {
            return@withContext CsvImportUiState.Failure(failureMessage)
        }

        CsvImportUiState.Review(
            analysis = analysis,
            account = account,
            signInverted = signInverted,
            signOverridden = false,
            preview = preview,
            categories = hydrate.categories,
            rules = hydrate.rules,
            existingHashes = existingHashes,
        )
    }
}

// ---------------------------------------------------------------------------
// UI pieces.
// ---------------------------------------------------------------------------

@Composable
private fun ImportHeader(onBack: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.padding(start = 8.dp, top = 20.dp, bottom = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .a11yRow(description = "Back", onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            TallyIcons.ChevronLeft(modifier = Modifier.size(22.dp))
        }
        Text(
            text = "Import statement",
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )
    }
}

@Composable
private fun PickFileBody(onPick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(vertical = 12.dp),
        ) {
            Text(
                text = "Import a bank statement",
                style = MaterialTheme.typography.titleSmall,
                color = TallyColors.Ink1,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "CSV exports from CBA, Bankwest or Amex. The file is read on this device only and nothing is saved until you confirm.",
                style = MaterialTheme.typography.bodyMedium,
                color = TallyColors.Ink2,
                textAlign = TextAlign.Center,
            )
        }
        Button(
            onClick = onPick,
            colors = ButtonDefaults.buttonColors(containerColor = TallyColors.Accent, contentColor = TallyColors.InkOnAccent),
            shape = RoundedCornerShape(TallyCardRadius),
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        ) {
            Text(text = "Choose file", style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
private fun LoadingBody(message: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator(color = TallyColors.Accent)
        Text(text = message, style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink2)
    }
}

@Composable
private fun FailureBody(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        GlyphBadge(glyph = "!", background = TallyColors.CriticalTint, tint = TallyColors.Critical, size = 44.dp)
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = TallyColors.Ink1,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = TallyColors.Accent, contentColor = TallyColors.InkOnAccent),
            shape = RoundedCornerShape(TallyCardRadius),
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Text(text = "Try another file", style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun CommittedBody(added: Int, skipped: Int, onImportAnother: () -> Unit, onDone: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        GlyphBadge(glyph = "✓", background = TallyColors.AccentTint, tint = TallyColors.Accent, size = 44.dp)
        Text(
            text = "$added added, $skipped duplicate${if (skipped == 1) "" else "s"} skipped.",
            style = MaterialTheme.typography.bodyLarge,
            color = TallyColors.Ink1,
            textAlign = TextAlign.Center,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(
                onClick = onImportAnother,
                colors = OutlinedButtonDefaults.outlinedButtonColors(contentColor = TallyColors.Ink1),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = "Import another file", style = MaterialTheme.typography.labelLarge)
            }
            Button(
                onClick = onDone,
                colors = ButtonDefaults.buttonColors(containerColor = TallyColors.Accent, contentColor = TallyColors.InkOnAccent),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = "Done", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun ReviewBody(
    state: CsvImportUiState.Review,
    onAccountChange: (AccountId) -> Unit,
    onSignToggle: () -> Unit,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    val layout = state.analysis.layout
    val confidencePct = (state.analysis.layout.confidence * 100).toInt()
    val categoryById = remember(state.categories) { state.categories.associateBy { it.id } }

    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // --- What was detected ---
        SectionLabel("What we found")
        TallyListGroup {
            TallyListRow(title = "Bank format", subtitle = bankFormatDisplayName(state.analysis.formatDetection.format))
            TallyDivider(modifier = Modifier.padding(start = 16.dp))
            TallyListRow(
                title = "Header row",
                subtitle = if (layout.hasHeader) "Found" else "Not found — the file starts with data",
            )
            TallyDivider(modifier = Modifier.padding(start = 16.dp))
            TallyListRow(title = "Date column", subtitle = describeColumn(layout.headerRow, layout.dateCol))
            TallyDivider(modifier = Modifier.padding(start = 16.dp))
            TallyListRow(title = "Description column", subtitle = describeColumn(layout.headerRow, layout.descriptionCol))
            TallyDivider(modifier = Modifier.padding(start = 16.dp))
            val amountSubtitle = if (layout.amountCol != null) {
                describeColumn(layout.headerRow, layout.amountCol)
            } else if (layout.debitCol != null && layout.creditCol != null) {
                "Split debit/credit — ${describeColumn(layout.headerRow, layout.debitCol)} and ${describeColumn(layout.headerRow, layout.creditCol)}"
            } else {
                "not found"
            }
            TallyListRow(title = "Amount column", subtitle = amountSubtitle)
        }
        if (!state.analysis.isConfident) {
            WarningBanner(
                "Low confidence ($confidencePct%) in this file's layout. Check every row below carefully before importing — " +
                    "there is no manual column picker in this build, so if this looks wrong, cancel and re-export the file.",
            )
        }

        // --- Sign convention ---
        SectionLabel("Spend vs. income")
        TallyListGroup {
            Row(
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = "Positive = spend", style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1)
                    Text(
                        text = describeSignResolution(state.analysis.signAnalysis.method, state.signInverted, state.signOverridden),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TallyColors.Ink2,
                    )
                }
                Switch(
                    checked = state.signInverted,
                    onCheckedChange = { onSignToggle() },
                    colors = SwitchDefaults.colors(checkedTrackColor = TallyColors.Accent),
                )
            }
        }
        if (state.analysis.signAnalysis.method != SignMethod.BALANCE_VERIFIED && !state.signOverridden) {
            WarningBanner("Not confirmed by a running balance — double check the amounts below before importing.")
        }

        // --- Account ---
        SectionLabel("Account")
        AccountPicker(selected = state.account, onSelect = onAccountChange)

        // --- Warnings from the parser itself ---
        state.preview.warnings.forEach { warning -> WarningBanner(warning) }

        // --- Duplicates ---
        if (state.preview.duplicateCount > 0) {
            Text(
                text = "${state.preview.duplicateCount} row${if (state.preview.duplicateCount == 1) "" else "s"} " +
                    "already in your ledger — ${if (state.preview.duplicateCount == 1) "it" else "they"} will be skipped.",
                style = MaterialTheme.typography.bodyMedium,
                color = TallyColors.Ink2,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }

        // --- Preview rows ---
        SectionLabel("${state.preview.rows.size} new transaction${if (state.preview.rows.size == 1) "" else "s"}")
        if (state.preview.rows.isEmpty()) {
            Text(
                text = "Nothing new to import from this file — every row is already in your ledger.",
                style = MaterialTheme.typography.bodyMedium,
                color = TallyColors.Ink2,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
            )
        } else {
            TallyListGroup {
                state.preview.rows.forEachIndexed { index, txn ->
                    val category = categoryById[txn.categoryId]
                    TallyListRow(
                        title = txn.merchant,
                        subtitle = "${formatRelativeDay(txn.date)}${category?.label?.let { " · $it" } ?: ""}",
                        trailing = { Text(text = formatTxnAmount(txn.amountCents), style = MaterialTheme.typography.bodyLarge, color = TallyColors.Ink1) },
                        leading = { CategoryBadge(colorIndex = index, label = category?.label ?: txn.merchant, size = 36.dp) },
                    )
                    if (index != state.preview.rows.lastIndex) TallyDivider(modifier = Modifier.padding(start = 16.dp))
                }
            }
        }

        // --- Actions ---
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            OutlinedButton(
                onClick = onCancel,
                colors = OutlinedButtonDefaults.outlinedButtonColors(contentColor = TallyColors.Ink1),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier.weight(1f).heightIn(min = 56.dp),
            ) {
                Text(text = "Cancel", style = MaterialTheme.typography.titleSmall)
            }
            Button(
                onClick = onConfirm,
                enabled = state.preview.rows.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = TallyColors.Accent,
                    contentColor = TallyColors.InkOnAccent,
                    disabledContainerColor = TallyColors.SurfaceSunk,
                    disabledContentColor = TallyColors.Ink3,
                ),
                shape = RoundedCornerShape(TallyCardRadius),
                modifier = Modifier.weight(1f).heightIn(min = 56.dp),
            ) {
                Text(
                    text = if (state.preview.rows.isNotEmpty()) "Import ${state.preview.rows.size}" else "Nothing to import",
                    style = MaterialTheme.typography.titleSmall,
                )
            }
        }
    }
}

@Composable
private fun AccountPicker(selected: AccountId, onSelect: (AccountId) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
    ) {
        IMPORT_ACCOUNTS.forEach { account ->
            val isSelected = account == selected
            Box(
                modifier = Modifier
                    .heightIn(min = 40.dp)
                    .background(
                        if (isSelected) TallyColors.AccentTint else TallyColors.SurfaceSunk,
                        RoundedCornerShape(999.dp),
                    )
                    .a11yRow(
                        description = "${accountDisplayName(account)}${if (isSelected) ", selected" else ""}",
                        onClick = { onSelect(account) },
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = accountDisplayName(account),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isSelected) TallyColors.AccentPress else TallyColors.Ink2,
                )
            }
        }
    }
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

@Composable
private fun WarningBanner(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(TallyColors.CautionTint, RoundedCornerShape(TallyCardRadius))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = TallyColors.Caution)
    }
}
