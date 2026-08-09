package com.tally.app.capture.parse

/**
 * Google Wallet (`com.google.android.apps.walletnfcrel`) tap-confirmation
 * notification shapes.
 *
 * `accountId = null` on purpose: a wallet tap confirmation says a card was
 * used, not *which* of the user's linked cards was used, so this parser never
 * assigns one. `CaptureReviewQueue` requires the user to pick an account
 * before an item like this can be accepted -- see `PendingCapture.account`'s
 * doc comment. The alternative (defaulting to some "most likely" account)
 * would be exactly the kind of guess this whole feature exists to avoid, just
 * applied to the account field instead of the amount's sign.
 *
 * Also the module's second-lowest-confidence table, for the same reason as
 * Amex: no verified real Google Wallet notification text was available to
 * build against, only the general shape ANDROID.md §4 describes ("Google
 * Wallet posts its own tap confirmations"). Same fail-safe applies: an
 * unmatched real string is a drop, never a wrong transaction.
 */
object GoogleWalletParser : TableDrivenParser(
    accountId = null,
    rules = listOf(
        ParseRule(Regex("""^You paid \$(?<amt>$AMOUNT_PATTERN) to (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Paid \$(?<amt>$AMOUNT_PATTERN) at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^\$(?<amt>$AMOUNT_PATTERN)\s*[·•-]\s*(?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false)
    )
)
