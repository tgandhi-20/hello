package com.tally.app.money

import java.time.LocalDate

/**
 * Whether an [AccountId] is a bank/cash account (money that has flowed
 * through it) or a credit card (money owed on it) — DESIGN-V5.md §1/§2.
 * The distinction matters because the SAME summed figure means opposite
 * things for the two kinds; a caller must branch on this rather than treat
 * every account's derived number as "a balance".
 */
enum class AccountKind { BANK, CARD }

/**
 * One account's derived state, built ONLY from transactions already in the
 * ledger — never a live balance, because Tally has no Open Banking
 * connection (DESIGN-V5.md §2: "the bank knows. Tally does not.").
 *
 * This is a SEALED type, not a flat data class with a nullable balance
 * field, so that "nothing imported yet" is impossible to confuse with "the
 * balance is exactly zero" AT THE TYPE LEVEL: [NoImports] simply has no
 * `derivedBalanceCents`/`asAtDate` fields for a caller to misread as 0/now.
 * A caller must `when`/`is`-branch to reach the figure at all, which is the
 * point.
 */
sealed interface AccountBalance {
    val accountId: AccountId

    /** Computed from [accountId] alone, so a bank/card account can never be
     *  mis-tagged by a caller passing the wrong kind at construction time. */
    val kind: AccountKind get() = when (accountId) {
        AccountId.CBA, AccountId.BANKWEST, AccountId.CASH -> AccountKind.BANK
        AccountId.CBA_CARD, AccountId.AMEX -> AccountKind.CARD
    }

    /** True for [Derived], false for [NoImports] — a convenience for a
     *  caller that only needs to branch, not destructure. */
    val hasData: Boolean

    val txnCount: Int

    /** Nothing has ever been imported or logged for this account. Render
     *  "nothing imported yet" — NEVER `$0.00` (DESIGN-V5.md §2's single most
     *  dangerous thing this screen could show). */
    data class NoImports(override val accountId: AccountId) : AccountBalance {
        override val hasData: Boolean = false
        override val txnCount: Int = 0
    }

    /**
     * `derivedBalanceCents` is the sum of every [Txn.amountCents] posted to
     * this account — positive = spend, negative = income, Types.kt's
     * convention, unchanged. What that sum MEANS depends on [kind]:
     *
     * - [AccountKind.BANK]: the net amount that has moved through the
     *   account across the imported history — positive = net spent out,
     *   negative = net received in. This is a flow, not a balance; it says
     *   nothing about what is actually sitting in the account today.
     * - [AccountKind.CARD]: what is OWED. A charge (positive) increases the
     *   debt; a payment (negative) reduces it. The same arithmetic as BANK,
     *   read the opposite way — which is exactly why a caller must go
     *   through [kind] rather than assume one meaning for every account.
     */
    data class Derived(
        override val accountId: AccountId,
        val derivedBalanceCents: Cents,
        val asAtDate: LocalDate,
        override val txnCount: Int,
    ) : AccountBalance {
        override val hasData: Boolean = true
    }
}

/**
 * Builds one [AccountBalance] per [AccountId], always all five entries in
 * [AccountId.entries] order — an account nobody has imported anything for is
 * still a real account and still gets a row (DESIGN-V5.md §3); it reports
 * [AccountBalance.NoImports] rather than being silently dropped from the
 * list.
 *
 * Pure function of [txns] alone — the SAME hydrated ledger
 * [computeMonthMoney] runs against, in the same recompute pass, never a
 * second scan of the vault (docs/AGENT-BRIEF.md §3).
 */
fun buildAccountBalances(txns: List<Txn>): List<AccountBalance> =
    AccountId.entries.map { account ->
        val accountTxns = txns.filter { it.account == account }
        if (accountTxns.isEmpty()) {
            AccountBalance.NoImports(account)
        } else {
            AccountBalance.Derived(
                accountId = account,
                derivedBalanceCents = accountTxns.sumOf { it.amountCents },
                asAtDate = accountTxns.maxOf { it.date },
                txnCount = accountTxns.size,
            )
        }
    }
