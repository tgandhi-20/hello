package com.tally.app.capture.parse

/**
 * Samsung Wallet / Samsung Pay (`com.samsung.android.spay`) tap-confirmation
 * notification shapes. See `GoogleWalletParser`'s doc comment for why
 * `accountId = null` and for this table's confidence level -- both apply here
 * identically.
 */
object SamsungWalletParser : TableDrivenParser(
    accountId = null,
    rules = listOf(
        ParseRule(Regex("""^You paid \$($AMOUNT_PATTERN) at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Payment of \$($AMOUNT_PATTERN) approved at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false)
    )
)
