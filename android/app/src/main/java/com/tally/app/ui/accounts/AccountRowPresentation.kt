package com.tally.app.ui.accounts

import com.tally.app.money.AccountBalance
import com.tally.app.money.AccountKind
import com.tally.app.ui.model.Cents
import com.tally.app.ui.statements.accountDisplayName
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Pure (non-Compose) wording for one accounts-list row — kept separate from
 * `AccountsSection.kt` so it is directly JUnit-testable on the host JVM, and
 * so the exact strings DESIGN-V5.md §2 makes non-negotiable live in one
 * place, not scattered across composables.
 *
 * The rules this file exists to enforce:
 *  - NEVER the words "available", "current" or a bare "balance" — those
 *    promise a live figure Tally cannot deliver.
 *  - Every derived figure carries the date it is good to.
 *  - A card's figure always says "owed" (or, in the rare case payments have
 *    outpaced charges, "in credit") — never presented as money held.
 *  - No imports for an account says exactly "nothing imported yet" — never
 *    a `$0.00` standing in for "unknown".
 */

private val AU_LOCALE: Locale = Locale.Builder().setLanguage("en").setRegion("AU").build()
private val AS_AT_DAY_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", AU_LOCALE)

/**
 * What one accounts-list row shows. [trailingCents] is `null` for
 * [AccountBalance.NoImports] — there is deliberately no figure to render in
 * that case, not a zero one (see this file's own doc comment).
 */
data class AccountRowPresentation(
    val title: String,
    val trailingCents: Cents?,
    val subtitle: String,
)

/** Maps one [AccountBalance] to what its row displays. */
fun accountRowPresentation(balance: AccountBalance): AccountRowPresentation {
    val title = accountDisplayName(balance.accountId)
    return when (balance) {
        is AccountBalance.NoImports -> AccountRowPresentation(
            title = title,
            trailingCents = null,
            subtitle = "Nothing imported yet",
        )
        is AccountBalance.Derived -> {
            val asAt = "from your imports, to ${AS_AT_DAY_MONTH.format(balance.asAtDate)}"
            val owed = balance.derivedBalanceCents
            when (balance.kind) {
                AccountKind.CARD -> if (owed >= 0) {
                    AccountRowPresentation(title, owed, "Owed, $asAt")
                } else {
                    AccountRowPresentation(title, -owed, "In credit, $asAt")
                }
                AccountKind.BANK -> if (owed >= 0) {
                    AccountRowPresentation(title, owed, "Net out, $asAt")
                } else {
                    AccountRowPresentation(title, -owed, "Net in, $asAt")
                }
            }
        }
    }
}
