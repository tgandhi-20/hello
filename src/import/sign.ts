/**
 * Sign-convention detection (CONTRACTS.md §6) — the highest-risk logic in the importer.
 * Getting this wrong silently inverts the user's entire financial history.
 *
 * App convention (src/types.ts): `Txn.amountCents` is POSITIVE for spend, NEGATIVE for
 * income. Bank files disagree on which literal sign means which:
 *   - CBA/Bankwest: negative in the file = spend.
 *   - Amex: positive in the file = spend (inverted vs the banks).
 *
 * `signInverted` (matches `ImportPreview.signInverted`): true when a positive value in
 * the file means spend (the Amex convention).
 *
 * Resolution order, most to least trustworthy:
 *   1. Balance-verified: if a running balance column exists, `balance[n] - balance[n-1]`
 *      must agree with the signed amount. This is authoritative — prefer it over any
 *      heuristic, and prefer it over a hardcoded "Amex is inverted" assumption.
 *   2. Majority-sign heuristic: nearly all values sharing one sign implies that sign is
 *      spend (statements are dominated by everyday purchases).
 *   3. Format hint fallback (weak): if neither of the above yields a confident answer,
 *      lean on the detected bank format as a last resort — never as the primary signal.
 *
 * The user can always override the result with the sign-convention toggle on the preview
 * screen (CONTRACTS.md §6) — nothing here is final until they confirm.
 */
import type { Cents } from '@/types';
import type { BankFormat } from './detect';
import type { StructuralLayout } from './columns';
import { parseMoneyToCents } from './money';

export type SignMethod = 'balance-verified' | 'heuristic-majority' | 'format-hint' | 'user-override';

export interface SignAnalysis {
  signInverted: boolean;
  /** 0–1. */
  confidence: number;
  method: SignMethod;
  warnings: string[];
}

/**
 * Extract the raw signed cents for one data row as literally written in the file, before
 * the spend/income convention is applied. For a debit/credit split, credit contributes
 * positively and debit contributes negatively to this raw value (column identity encodes
 * direction regardless of the literal sign printed in the cell) — this keeps the same
 * `ourAmount = signInverted ? raw : -raw` formula correct for both single-amount and
 * split-column files.
 */
export function rawSignedCentsForRow(layout: StructuralLayout, row: string[]): Cents | null {
  if (layout.amountCol !== null) {
    return parseMoneyToCents(row[layout.amountCol] ?? '');
  }
  if (layout.debitCol !== null && layout.creditCol !== null) {
    const debitRaw = parseMoneyToCents(row[layout.debitCol] ?? '');
    const creditRaw = parseMoneyToCents(row[layout.creditCol] ?? '');
    const debit = debitRaw !== null ? Math.abs(debitRaw) : 0;
    const credit = creditRaw !== null ? Math.abs(creditRaw) : 0;
    if (debitRaw === null && creditRaw === null) return null;
    return credit - debit;
  }
  return null;
}

/** Apply a resolved sign convention to a raw signed amount, producing the app convention. */
export function applySignConvention(rawSigned: Cents, signInverted: boolean): Cents {
  return signInverted ? rawSigned : -rawSigned;
}

interface BalanceCheckResult {
  signInverted: boolean;
  agreement: number;
  samples: number;
}

const CENTS_TOLERANCE = 1; // allow 1c of rounding slack

function checkBalanceHypothesis(
  dateOrder: 'as-is' | 'reversed',
  balances: Cents[],
  raws: (Cents | null)[]
): BalanceCheckResult | null {
  const bal = dateOrder === 'reversed' ? balances.slice().reverse() : balances;
  const raw = dateOrder === 'reversed' ? raws.slice().reverse() : raws;

  let agreeNotInverted = 0;
  let agreeInverted = 0;
  let samples = 0;

  for (let i = 1; i < bal.length; i++) {
    const r = raw[i];
    if (r === null) continue;
    const diff = bal[i] - bal[i - 1];
    samples++;
    if (Math.abs(diff - r) <= CENTS_TOLERANCE) agreeNotInverted++;
    if (Math.abs(diff + r) <= CENTS_TOLERANCE) agreeInverted++;
  }

  if (samples === 0) return null;
  if (agreeNotInverted >= agreeInverted) {
    return { signInverted: false, agreement: agreeNotInverted / samples, samples };
  }
  return { signInverted: true, agreement: agreeInverted / samples, samples };
}

const MAJORITY_THRESHOLD = 0.7;
const BALANCE_AGREEMENT_THRESHOLD = 0.6;
const MIN_BALANCE_SAMPLES = 3;

/**
 * Resolve the sign convention for a parsed CSV. Balance verification wins whenever a
 * usable balance column is present and enough rows agree; otherwise falls back to a
 * majority-sign heuristic, and finally to a weak hint from the detected bank format.
 */
export function analyseSignConvention(
  layout: StructuralLayout,
  formatHint: BankFormat | null
): SignAnalysis {
  const warnings: string[] = [];
  const rows = layout.dataRows;
  const raws = rows.map((row) => rawSignedCentsForRow(layout, row));

  // --- 1. Balance-verified (authoritative) ---
  if (layout.balanceCol !== null) {
    const balances: Cents[] = [];
    const alignedRaws: (Cents | null)[] = [];
    for (const row of rows) {
      const b = parseMoneyToCents(row[layout.balanceCol] ?? '');
      if (b === null) continue;
      balances.push(b);
      alignedRaws.push(rawSignedCentsForRow(layout, row));
    }

    const asIs = checkBalanceHypothesis('as-is', balances, alignedRaws);
    const reversed = checkBalanceHypothesis('reversed', balances, alignedRaws);
    const best = [asIs, reversed]
      .filter((r): r is BalanceCheckResult => r !== null)
      .sort((a, b) => b.agreement - a.agreement)[0];

    if (best && best.samples >= MIN_BALANCE_SAMPLES && best.agreement >= BALANCE_AGREEMENT_THRESHOLD) {
      return {
        signInverted: best.signInverted,
        confidence: best.agreement,
        method: 'balance-verified',
        warnings,
      };
    }
    warnings.push('A balance column was found but running-balance differences did not consistently agree with the amounts — falling back to a heuristic. Please double-check the sign convention.');
  }

  // --- 2. Majority-sign heuristic ---
  const nonZero = raws.filter((r): r is Cents => r !== null && r !== 0);
  if (nonZero.length > 0) {
    const negativeCount = nonZero.filter((r) => r < 0).length;
    const positiveCount = nonZero.length - negativeCount;
    const majorityFrac = Math.max(negativeCount, positiveCount) / nonZero.length;

    if (majorityFrac >= MAJORITY_THRESHOLD) {
      const negativeIsMajority = negativeCount >= positiveCount;
      if (negativeIsMajority) {
        // Most values negative -> standard bank convention (negative = spend).
        return { signInverted: false, confidence: majorityFrac, method: 'heuristic-majority', warnings };
      }
      warnings.push(
        'Most amounts in this file are positive — assuming the Amex-style convention (positive = spend). Please verify against the sample rows below.'
      );
      return { signInverted: true, confidence: majorityFrac * 0.9, method: 'heuristic-majority', warnings };
    }
  }

  // --- 3. Weak fallback: detected format hint ---
  warnings.push('Could not confidently determine the sign convention from the data — please verify against the sample rows below before importing.');
  if (formatHint === 'amex') {
    return { signInverted: true, confidence: 0.5, method: 'format-hint', warnings };
  }
  return { signInverted: false, confidence: 0.3, method: 'format-hint', warnings };
}
