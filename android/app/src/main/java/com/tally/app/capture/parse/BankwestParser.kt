package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds

/** Bankwest app (`au.com.bankwest.mobile`) notification shapes. */
object BankwestParser : TableDrivenParser(
    accountId = AccountIds.BANKWEST,
    rules = listOf(
        ParseRule(Regex("""^Purchase of \$(?<amt>$AMOUNT_PATTERN) at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^You spent \$(?<amt>$AMOUNT_PATTERN) at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Refund of \$(?<amt>$AMOUNT_PATTERN) from (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = true),
        ParseRule(Regex("""^You were refunded \$(?<amt>$AMOUNT_PATTERN) (?:by|from) (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = true)
    )
)
