package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds

/**
 * Amex app (`com.americanexpress.android.acctsvcs.au` / `.us` -- see
 * `CapturePackages`) notification shapes.
 *
 * **Lowest-confidence parser in this module.** Unlike the CBA/Bankwest
 * examples given in the brief, no verified real Amex Australia push-notification
 * text was available to build this table against -- these patterns are a
 * best-effort composite of Amex's typical phrasing style, not a captured real
 * string. This is safe by construction, not just by intent: a wrong guess here
 * costs a dropped notification (counted, visible in the review screen's "N
 * couldn't be read" line), never a wrong transaction. If real Amex text
 * doesn't match any row below, it will show up as drops; extending the table
 * with the actual wording is then a one-line addition per shape, same as any
 * other bank here.
 */
object AmexParser : TableDrivenParser(
    accountId = AccountIds.AMEX,
    rules = listOf(
        ParseRule(Regex("""^A new transaction of \$($AMOUNT_PATTERN) (?:was made|has been made) at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^You made a \$($AMOUNT_PATTERN) purchase at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Your card was charged \$($AMOUNT_PATTERN) at (.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^A credit of \$($AMOUNT_PATTERN) (?:was applied|has been applied) at (.+)$""", RegexOption.IGNORE_CASE), isCredit = true),
        ParseRule(Regex("""^You were refunded \$($AMOUNT_PATTERN) (?:by|from|at) (.+)$""", RegexOption.IGNORE_CASE), isCredit = true)
    )
)
