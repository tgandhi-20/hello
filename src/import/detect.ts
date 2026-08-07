/**
 * Best-effort bank format identification (CONTRACTS.md §6). This is a HINT ONLY, used to
 * preselect the account and bias the sign-convention default — it must never be trusted
 * on its own. Low confidence always falls through to the manual mapper / user confirmation
 * in the preview screen. Header names are one signal among several, never load-bearing
 * alone, because public bank CSV docs are inconsistent and formats drift (§6).
 */
import type { AccountId } from '@/types';
import type { StructuralLayout } from './columns';

export type BankFormat = 'cba' | 'bankwest' | 'amex' | 'generic';

export interface FormatDetection {
  format: BankFormat;
  /** 0–1. Below ~0.5 the caller should treat this as a weak hint only. */
  confidence: number;
  accountGuess: AccountId;
  reasons: string[];
}

function headerIncludes(tokens: string[], needle: string): boolean {
  return tokens.some((t) => t.includes(needle));
}

/**
 * Guess which bank produced this file from header text (if present) and the structural
 * shape already detected in `columns.ts`. Never authoritative — see module doc comment.
 */
export function detectBankFormat(layout: StructuralLayout): FormatDetection {
  const headerTokens = (layout.headerRow ?? []).map((h) => h.toLowerCase().trim());
  const colCount = layout.columns.length;
  const hasDebitCredit = layout.debitCol !== null && layout.creditCol !== null;
  const hasBalance = layout.balanceCol !== null;

  let cba = 0;
  let bankwest = 0;
  let amex = 0;
  const reasons: string[] = [];

  // --- CBA: typically headerless Date,Amount,Description,Balance ---
  if (!layout.hasHeader && colCount <= 4 && layout.dateCol === 0) {
    cba += 0.4;
    reasons.push('Headerless with date in column 1 (CBA-style).');
  }
  if (!layout.hasHeader && hasBalance) {
    cba += 0.2;
  }
  // CBA also appears headered as Date,Description,Debit,Credit,Balance
  if (
    layout.hasHeader &&
    hasDebitCredit &&
    hasBalance &&
    colCount <= 5 &&
    !headerIncludes(headerTokens, 'bsb')
  ) {
    cba += 0.35;
    reasons.push('Headered Date/Description/Debit/Credit/Balance without a BSB column (CBA-style).');
  }

  // --- Bankwest: BSB Number, Account Number, Transaction Date, Narration, Cheque, Debit, Credit, Balance, Transaction Type ---
  if (headerIncludes(headerTokens, 'bsb')) {
    bankwest += 0.5;
    reasons.push('Header contains "BSB".');
  }
  if (headerIncludes(headerTokens, 'narration')) {
    bankwest += 0.25;
    reasons.push('Header contains "Narration".');
  }
  if (hasDebitCredit && hasBalance && colCount >= 8) {
    bankwest += 0.2;
  }

  // --- Amex: Date, Description, Card Member, Account #, Amount ---
  if (headerIncludes(headerTokens, 'card member')) {
    amex += 0.45;
    reasons.push('Header contains "Card Member".');
  }
  if (
    (headerIncludes(headerTokens, 'account #') || headerIncludes(headerTokens, 'account#')) &&
    !headerIncludes(headerTokens, 'bsb')
  ) {
    amex += 0.2;
    reasons.push('Header contains "Account #" without a BSB column.');
  }
  if (layout.amountCol !== null && !hasBalance && !hasDebitCredit && (colCount === 5 || colCount === 4)) {
    amex += 0.2;
  }

  const scored: [BankFormat, number][] = [
    ['cba', cba],
    ['bankwest', bankwest],
    ['amex', amex],
  ];
  scored.sort((a, b) => b[1] - a[1]);
  const [topFormat, topScore] = scored[0];

  if (topScore < 0.45) {
    return {
      format: 'generic',
      confidence: Math.max(0, topScore),
      accountGuess: 'cba',
      reasons: reasons.length ? reasons : ['No confident structural or header match to a known bank.'],
    };
  }

  const accountGuess: AccountId = topFormat === 'generic' ? 'cba' : topFormat;
  return { format: topFormat, confidence: Math.min(1, topScore), accountGuess, reasons };
}
