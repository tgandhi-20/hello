package com.tally.app.ui.accounts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tally.app.money.AccountBalance
import com.tally.app.money.AccountId
import com.tally.app.ui.components.MoneyText
import com.tally.app.ui.components.TallyDivider
import com.tally.app.ui.components.TallyListGroup
import com.tally.app.ui.components.TallyListRow
import com.tally.app.ui.components.TallySectionLabel
import androidx.compose.ui.unit.dp

/**
 * Home's accounts list (DESIGN-V5.md §3) — one grouped surface, hairline
 * dividers between rows, CBA-style density, never one card per account.
 *
 * Each row shows the account name, its derived figure (or nothing at all
 * when there is none — see [accountRowPresentation]'s own doc comment), and
 * the as-at/owed wording that keeps a derived figure from ever reading like
 * a live bank balance. Tapping a row hands the tapped [AccountId] to
 * [onOpenAccount]; this composable does not navigate itself.
 */
@Composable
fun AccountsSection(
    accounts: List<AccountBalance>,
    onOpenAccount: (AccountId) -> Unit,
    modifier: Modifier = Modifier,
) {
    // buildAccountBalances always returns one entry per AccountId, but an
    // empty list (e.g. before the first hydrate) renders nothing rather than
    // an empty grouped surface — "empty means render nothing" (AGENT-BRIEF §5).
    if (accounts.isEmpty()) return
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TallySectionLabel("Accounts")
        TallyListGroup {
            accounts.forEachIndexed { index, balance ->
                if (index > 0) TallyDivider()
                val presentation = accountRowPresentation(balance)
                val trailingContent: (@Composable () -> Unit)? = presentation.trailingCents?.let { cents ->
                    { MoneyText(cents = cents) }
                }
                TallyListRow(
                    title = presentation.title,
                    subtitle = presentation.subtitle,
                    trailing = trailingContent,
                    chevron = true,
                    onClick = { onOpenAccount(balance.accountId) },
                )
            }
        }
    }
}
