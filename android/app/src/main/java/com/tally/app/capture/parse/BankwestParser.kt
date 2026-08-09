package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds

/** Bankwest app (`au.com.bankwest.mobile`) notification shapes. */
object BankwestParser : TableDrivenParser(
    accountId = AccountIds.BANKWEST,
    rules = listOf(
        ParseRule(Regex("""^Purchase of \$($AMOUNT_PATTERN) at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^You spent \$($AMOUNT_PATTERN) at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Refund of \$($AMOUNT_PATTERN) from (.+)$""", RegexOption.IGNORE_CASE), isCredit = true),
        ParseRule(Regex("""^You were refunded \$($AMOUNT_PATTERN) (?:by|from) (.+)$""", RegexOption.IGNORE_CASE), isCredit = true)
    )
)
