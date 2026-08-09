package com.tally.app.capture.parse

/** What a parser found in a notification's text, before sign/account resolution. */
data class ParsedNotification(
    /** Always positive here -- [BankNotificationParser] decides spend vs. credit separately. */
    val amountCents: Long,
    val merchant: String,
    /** True = refund/credit (money in). False = spend (money out). Never guessed -- see [ParseRule]. */
    val isCredit: Boolean
)

/** One bank or wallet's notification reader. */
interface BankNotificationParser {
    /**
     * [com.tally.app.capture.model.AccountIds] value this source always maps
     * to, or `null` when the notification alone cannot say which underlying
     * card was used (the wallet apps -- see their parsers).
     */
    val accountId: String?

    /** `null` = did not match any known shape. Dropped and counted by the caller, never guessed. */
    fun parse(text: String): ParsedNotification?
}

/** One row of a bank's parse table. `regex` must contain named groups `amt` and `merchant`. */
data class ParseRule(val regex: Regex, val isCredit: Boolean)

/**
 * Table-driven parser shared by every bank/wallet: tries each [ParseRule] in
 * order and returns the first match. This is the mechanism, not the data --
 * see `CbaParser`, `BankwestParser`, etc. for the actual tables.
 *
 * A notification shaped like `"$45.00 debited from your account"` has no `at
 * <merchant>` (or equivalent) anywhere in it, so it matches none of these
 * regexes and `parse` returns `null` -- there is no separate "no merchant"
 * rule to write, because every rule here requires a `merchant` group by
 * construction. That `null` is exactly the "dropped and counted, never
 * guessed" behaviour deliverable 2 requires.
 */
open class TableDrivenParser(
    override val accountId: String?,
    private val rules: List<ParseRule>
) : BankNotificationParser {

    override fun parse(text: String): ParsedNotification? {
        // Collapse to one line first: `.` does not match `\n` by default, so an
        // un-collapsed multi-line EXTRA_BIG_TEXT could truncate a merchant
        // capture at an internal line break instead of running to the real end.
        val body = text.replace(Regex("\\s*[\\r\\n]+\\s*"), " ").trim()
        if (body.isEmpty()) return null

        for (rule in rules) {
            val match = rule.regex.find(body) ?: continue
            val amtText = match.groups["amt"]?.value ?: continue
            val merchantText = match.groups["merchant"]?.value
                ?.trim()
                ?.trim('.', ',', ';', ':', '!')
                ?.trim()
                ?: continue
            if (merchantText.isEmpty()) continue
            val cents = AmountCents.parseNumeral(amtText) ?: continue
            return ParsedNotification(amountCents = cents, merchant = merchantText, isCredit = rule.isCredit)
        }
        return null
    }
}

/** Numeral shape shared by every bank's regex table: digits, optional thousands commas, optional 1-2 decimal places. */
internal const val AMOUNT_PATTERN = """[\d,]{1,12}(?:\.\d{1,2})?"""
