package com.tally.app.csvimport

import com.tally.app.money.Cents
import kotlin.math.abs

/**
 * Sign-convention detection — ported from src/import/sign.ts. The
 * highest-risk logic in the importer: getting this wrong silently inverts the
 * user's entire financial history.
 *
 * App convention: `Txn.amountCents` is POSITIVE for spend, NEGATIVE for
 * income. Bank files disagree on which literal sign means which:
 *   - CBA/Bankwest: negative in the file = spend.
 *   - Amex: positive in the file = spend (inverted vs the banks).
 *
 * [SignAnalysis.signInverted]: true when a positive value in the file means
 * spend (the Amex convention).
 *
 * Resolution order, most to least trustworthy:
 *   1. Balance-verified: if a running balance column exists,
 *      `balance[n] - balance[n-1]` must agree with the signed amount. This is
 *      authoritative — prefer it over any heuristic, and prefer it over a
 *      hardcoded "Amex is inverted" assumption.
 *   2. Majority-sign heuristic: nearly all values sharing one sign implies
 *      that sign is spend (statements are dominated by everyday purchases).
 *   3. Format hint fallback (weak): lean on the detected bank format as a
 *      last resort — never as the primary signal.
 */
enum class SignMethod { BALANCE_VERIFIED, HEURISTIC_MAJORITY, FORMAT_HINT, USER_OVERRIDE }

data class SignAnalysis(
    val signInverted: Boolean,
    /** 0-1. */
    val confidence: Double,
    val method: SignMethod,
    val warnings: List<String>
)

/**
 * Extract the raw signed cents for one data row as literally written in the
 * file, before the spend/income convention is applied. For a debit/credit
 * split, credit contributes positively and debit contributes negatively to
 * this raw value (column identity encodes direction regardless of the
 * literal sign printed in the cell) — this keeps the same
 * `ourAmount = signInverted ? raw : -raw` formula correct for both
 * single-amount and split-column files.
 */
fun rawSignedCentsForRow(layout: StructuralLayout, row: List<String>): Cents? {
    if (layout.amountCol != null) {
        return parseMoneyToCents(row.getOrElse(layout.amountCol) { "" })
    }
    if (layout.debitCol != null && layout.creditCol != null) {
        val debitRaw = parseMoneyToCents(row.getOrElse(layout.debitCol) { "" })
        val creditRaw = parseMoneyToCents(row.getOrElse(layout.creditCol) { "" })
        val debit = if (debitRaw != null) abs(debitRaw) else 0L
        val credit = if (creditRaw != null) abs(creditRaw) else 0L
        if (debitRaw == null && creditRaw == null) return null
        return credit - debit
    }
    return null
}

/** Apply a resolved sign convention to a raw signed amount, producing the app convention. */
fun applySignConvention(rawSigned: Cents, signInverted: Boolean): Cents {
    val result = if (signInverted) rawSigned else -rawSigned
    // Normalise `-0` (arithmetic identity only for Long, but kept for parity/clarity
    // with the TS source, which guards a real `-0` floating-point edge case).
    return if (result == 0L) 0L else result
}

private data class BalanceCheckResult(val signInverted: Boolean, val agreement: Double, val samples: Int)

private const val CENTS_TOLERANCE = 1L // allow 1c of rounding slack

private fun checkBalanceHypothesis(reversed: Boolean, balances: List<Cents>, raws: List<Cents?>): BalanceCheckResult? {
    val bal = if (reversed) balances.reversed() else balances
    val raw = if (reversed) raws.reversed() else raws

    var agreeNotInverted = 0
    var agreeInverted = 0
    var samples = 0

    for (i in 1 until bal.size) {
        val r = raw[i] ?: continue
        val diff = bal[i] - bal[i - 1]
        samples++
        if (abs(diff - r) <= CENTS_TOLERANCE) agreeNotInverted++
        if (abs(diff + r) <= CENTS_TOLERANCE) agreeInverted++
    }

    if (samples == 0) return null
    return if (agreeNotInverted >= agreeInverted) {
        BalanceCheckResult(false, agreeNotInverted.toDouble() / samples, samples)
    } else {
        BalanceCheckResult(true, agreeInverted.toDouble() / samples, samples)
    }
}

private const val MAJORITY_THRESHOLD = 0.7
private const val BALANCE_AGREEMENT_THRESHOLD = 0.6
private const val MIN_BALANCE_SAMPLES = 3

/**
 * Resolve the sign convention for a parsed CSV. Balance verification wins
 * whenever a usable balance column is present and enough rows agree;
 * otherwise falls back to a majority-sign heuristic, and finally to a weak
 * hint from the detected bank format.
 */
fun analyseSignConvention(layout: StructuralLayout, formatHint: BankFormat?): SignAnalysis {
    val warnings = mutableListOf<String>()
    val rows = layout.dataRows
    val raws = rows.map { rawSignedCentsForRow(layout, it) }

    // --- 1. Balance-verified (authoritative) ---
    if (layout.balanceCol != null) {
        val balances = mutableListOf<Cents>()
        val alignedRaws = mutableListOf<Cents?>()
        for (row in rows) {
            val b = parseMoneyToCents(row.getOrElse(layout.balanceCol) { "" }) ?: continue
            balances.add(b)
            alignedRaws.add(rawSignedCentsForRow(layout, row))
        }

        val asIs = checkBalanceHypothesis(false, balances, alignedRaws)
        val reversed = checkBalanceHypothesis(true, balances, alignedRaws)
        val best = listOfNotNull(asIs, reversed).sortedByDescending { it.agreement }.firstOrNull()

        if (best != null && best.samples >= MIN_BALANCE_SAMPLES && best.agreement >= BALANCE_AGREEMENT_THRESHOLD) {
            return SignAnalysis(best.signInverted, best.agreement, SignMethod.BALANCE_VERIFIED, warnings)
        }
        warnings.add("A balance column was found but running-balance differences did not consistently agree with the amounts — falling back to a heuristic. Please double-check the sign convention.")
    }

    // --- 2. Majority-sign heuristic ---
    val nonZero = raws.filterNotNull().filter { it != 0L }
    if (nonZero.isNotEmpty()) {
        val negativeCount = nonZero.count { it < 0 }
        val positiveCount = nonZero.size - negativeCount
        val majorityFrac = maxOf(negativeCount, positiveCount).toDouble() / nonZero.size

        if (majorityFrac >= MAJORITY_THRESHOLD) {
            val negativeIsMajority = negativeCount >= positiveCount
            if (negativeIsMajority) {
                // Most values negative -> standard bank convention (negative = spend).
                return SignAnalysis(false, majorityFrac, SignMethod.HEURISTIC_MAJORITY, warnings)
            }
            warnings.add("Most amounts in this file are positive — assuming the Amex-style convention (positive = spend). Please verify against the sample rows below.")
            return SignAnalysis(true, majorityFrac * 0.9, SignMethod.HEURISTIC_MAJORITY, warnings)
        }
    }

    // --- 3. Weak fallback: detected format hint ---
    warnings.add("Could not confidently determine the sign convention from the data — please verify against the sample rows below before importing.")
    if (formatHint == BankFormat.AMEX) {
        return SignAnalysis(true, 0.5, SignMethod.FORMAT_HINT, warnings)
    }
    return SignAnalysis(false, 0.3, SignMethod.FORMAT_HINT, warnings)
}
