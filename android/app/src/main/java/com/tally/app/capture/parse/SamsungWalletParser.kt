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
        ParseRule(Regex("""^You paid \$(?<amt>$AMOUNT_PATTERN) at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Payment of \$(?<amt>$AMOUNT_PATTERN) approved at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false)
    )
)
