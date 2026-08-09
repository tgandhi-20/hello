package com.tally.app.capture.parse

import com.tally.app.capture.model.AccountIds

/**
 * CommBank app (`com.commbank.netbank`) notification shapes.
 *
 * Does **not** attempt to distinguish the everyday account (`'cba'`) from a
 * CBA credit card (`'cba-card'`) -- the CommBank app is a single package
 * covering both, and nothing in its spend/purchase notification text reliably
 * says which product was charged (unlike Amex or Bankwest, which are their own
 * separate apps). Everything from this package defaults to `'cba'`. Getting
 * this right for a card holder would need a per-product keyword the app is not
 * known to include; flagged in the delivery report rather than guessed here.
 */
object CbaParser : TableDrivenParser(
    accountId = AccountIds.CBA,
    rules = listOf(
        ParseRule(Regex("""^You spent \$(?<amt>$AMOUNT_PATTERN) at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^Purchase of \$(?<amt>$AMOUNT_PATTERN) at (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = false),
        ParseRule(Regex("""^You were refunded \$(?<amt>$AMOUNT_PATTERN) (?:by|from) (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = true),
        ParseRule(Regex("""^\$(?<amt>$AMOUNT_PATTERN) (?:was )?refunded (?:by|from) (?<merchant>.+)$""", RegexOption.IGNORE_CASE), isCredit = true)
    )
)
