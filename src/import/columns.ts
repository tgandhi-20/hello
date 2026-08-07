/**
 * Structural column-role detection (CONTRACTS.md §6). We never trust header names —
 * public bank CSV documentation is inconsistent and formats drift. Instead every column
 * is sampled and scored by the *shape* of its content: does it parse as a date, as a
 * signed amount, is it mostly free text, is it a large monotonic-ish running balance.
 */
import { looksLikeDate, tryParseDate } from './dates';
import { looksLikeMoney, parseMoneyToCents } from './money';

export type ColumnRole = 'date' | 'amount' | 'debit' | 'credit' | 'balance' | 'description' | 'unknown';

export interface ColumnProfile {
  index: number;
  role: ColumnRole;
  /** 0–1 confidence in this column's role assignment. */
  score: number;
}

export interface StructuralLayout {
  hasHeader: boolean;
  headerRow: string[] | null;
  /** Data rows only — header row (if any) excluded. */
  dataRows: string[][];
  columns: ColumnProfile[];
  dateCol: number | null;
  descriptionCol: number | null;
  /** Set when a single signed amount column carries the transaction value. */
  amountCol: number | null;
  /** Set instead of `amountCol` when spend/income are split across two columns. */
  debitCol: number | null;
  creditCol: number | null;
  balanceCol: number | null;
  /** Overall confidence that this structural read is trustworthy (0–1). */
  confidence: number;
  warnings: string[];
}

const SAMPLE_SIZE = 60;

function fraction(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

/** Score how "row 0 is a header, not data" a raw matrix looks. */
function rowLooksLikeData(row: string[]): number {
  const nonEmpty = row.filter((c) => c !== '');
  if (nonEmpty.length === 0) return 0;
  const matches = nonEmpty.filter((c) => looksLikeDate(c) || looksLikeMoney(c)).length;
  return fraction(matches, nonEmpty.length);
}

/** Detect whether the first row of the matrix is a header row. */
function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rowLooksLikeData(rows[0]);
  const rest = rows.slice(1, Math.min(rows.length, 6)).map(rowLooksLikeData);
  const restAvg = rest.reduce((a, b) => a + b, 0) / Math.max(1, rest.length);
  // Header rows very rarely look like dates/amounts; data rows do more than headers do.
  // Compare RELATIVELY, not against a fixed absolute threshold — a file with many
  // free-text columns (e.g. only date + amount are date/money-shaped out of five
  // columns) can have a legitimately low data-row score too, so what matters is that
  // the header scores much lower than the data rows that follow it.
  if (restAvg <= 0) return false;
  return first <= restAvg * 0.5;
}

interface ColumnStats {
  index: number;
  total: number;
  emptyCount: number;
  dateCount: number;
  moneyCount: number;
  textCount: number;
  /** Signed cents for cells that parsed as money, in row order (nulls for non-money cells). */
  moneyValues: (number | null)[];
  meanAbsMoney: number;
}

function profileColumns(dataRows: string[][], colCount: number): ColumnStats[] {
  const sample = dataRows.slice(0, SAMPLE_SIZE);
  const stats: ColumnStats[] = [];

  for (let c = 0; c < colCount; c++) {
    let total = 0;
    let emptyCount = 0;
    let dateCount = 0;
    let moneyCount = 0;
    let textCount = 0;
    let moneySum = 0;
    const moneyValues: (number | null)[] = [];

    for (const row of sample) {
      const cell = row[c] ?? '';
      total++;
      if (cell === '') {
        emptyCount++;
        moneyValues.push(null);
        continue;
      }
      if (looksLikeDate(cell)) dateCount++;
      const cents = parseMoneyToCents(cell);
      if (cents !== null) {
        moneyCount++;
        moneySum += Math.abs(cents);
        moneyValues.push(cents);
      } else {
        moneyValues.push(null);
        // "Text" = has letters, isn't purely numeric/punctuation.
        if (/[A-Za-z]/.test(cell)) textCount++;
      }
    }

    stats.push({
      index: c,
      total,
      emptyCount,
      dateCount,
      moneyCount,
      textCount,
      moneyValues,
      meanAbsMoney: moneyCount > 0 ? moneySum / moneyCount : 0,
    });
  }

  return stats;
}

/**
 * Given a raw matrix (already known to be data rows, no header), work out which column
 * is which by content shape and return a full structural layout with a confidence score.
 */
export function detectStructure(rawRows: string[][]): StructuralLayout {
  const warnings: string[] = [];
  if (rawRows.length === 0) {
    return {
      hasHeader: false,
      headerRow: null,
      dataRows: [],
      columns: [],
      dateCol: null,
      descriptionCol: null,
      amountCol: null,
      debitCol: null,
      creditCol: null,
      balanceCol: null,
      confidence: 0,
      warnings: ['The file has no rows.'],
    };
  }

  const hasHeader = detectHeader(rawRows);
  const headerRow = hasHeader ? rawRows[0] : null;
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  const colCount = dataRows.reduce((max, r) => Math.max(max, r.length), rawRows[0]?.length ?? 0);
  const stats = profileColumns(dataRows, colCount);
  const rowsSampled = Math.min(dataRows.length, SAMPLE_SIZE);

  // --- date column: highest date-hit fraction, must clear a real threshold ---
  let dateCol: number | null = null;
  let dateScore = 0;
  for (const s of stats) {
    const populated = s.total - s.emptyCount;
    const score = fraction(s.dateCount, Math.max(1, populated));
    if (populated > 0 && score > dateScore) {
      dateScore = score;
      dateCol = s.index;
    }
  }
  if (dateScore < 0.6) {
    dateCol = null;
    warnings.push('Could not confidently identify a date column.');
  }

  // --- money-shaped columns (excluding the date column) ---
  const moneyCols = stats.filter((s) => {
    if (s.index === dateCol) return false;
    const populated = s.total - s.emptyCount;
    return populated > 0 && fraction(s.moneyCount, populated) > 0.6;
  });

  // A real transaction amount/debit/credit/balance column varies row to row. A column
  // that merely *parses* as a number but barely varies (e.g. a constant account number
  // with no separators) is an identifier, not a monetary value — exclude it from
  // amount/debit/credit/balance candidacy so it can't be mistaken for one of them,
  // and so it can't pollute magnitude comparisons used to pick the real ones.
  const transactionMoneyCols = moneyCols.filter((s) => {
    const values = s.moneyValues.filter((v): v is number => v !== null);
    if (values.length < 3) return true;
    const distinctFrac = fraction(new Set(values).size, values.length);
    return distinctFrac > 0.3;
  });

  // --- description column: most text-heavy, not money/date-shaped ---
  let descriptionCol: number | null = null;
  let descScore = -1;
  for (const s of stats) {
    if (s.index === dateCol) continue;
    if (moneyCols.some((m) => m.index === s.index)) continue;
    const populated = s.total - s.emptyCount;
    const score = fraction(s.textCount, Math.max(1, populated));
    if (populated > 0 && score > descScore) {
      descScore = score;
      descriptionCol = s.index;
    }
  }
  // Fall back: sometimes description also contains numbers/refs and scored low against a
  // stricter money column — pick the least money-like, non-date column with real content.
  if (descriptionCol === null) {
    let best: ColumnStats | null = null;
    let bestPopulated = -1;
    for (const s of stats) {
      if (s.index === dateCol) continue;
      if (moneyCols.some((m) => m.index === s.index)) continue;
      const populated = s.total - s.emptyCount;
      if (populated > bestPopulated) {
        bestPopulated = populated;
        best = s;
      }
    }
    descriptionCol = best?.index ?? null;
    if (descriptionCol === null) warnings.push('Could not confidently identify a description column.');
  }

  // --- split remaining money columns into amount / debit+credit / balance ---
  let amountCol: number | null = null;
  let debitCol: number | null = null;
  let creditCol: number | null = null;
  let balanceCol: number | null = null;

  const remaining = transactionMoneyCols.slice().sort((a, b) => b.meanAbsMoney - a.meanAbsMoney);

  // Balance: mostly-populated and much larger in magnitude than the *individual*
  // transaction values around it. Compare against the MEDIAN of the other columns'
  // pooled values, not their per-column means — a single large transaction (e.g. a
  // salary credit) would otherwise skew a mean-based comparison enough to hide a real
  // balance column. Try candidates largest-magnitude-first in case the biggest one
  // doesn't pan out.
  for (const candidate of remaining) {
    const others = remaining.filter((s) => s.index !== candidate.index);
    if (others.length === 0) break;

    const populatedFrac = fraction(candidate.total - candidate.emptyCount, candidate.total);
    const pool = others
      .flatMap((s) => s.moneyValues.filter((v): v is number => v !== null).map(Math.abs))
      .sort((a, b) => a - b);
    const medianOthers = pool.length ? pool[Math.floor(pool.length / 2)] : 0;
    const isMuchLarger = medianOthers === 0 ? true : candidate.meanAbsMoney > medianOthers * 2.5;

    if (populatedFrac > 0.85 && isMuchLarger) {
      balanceCol = candidate.index;
      break;
    }
  }

  const nonBalance = remaining.filter((s) => s.index !== balanceCol);

  if (nonBalance.length === 1) {
    // Single signed amount column.
    amountCol = nonBalance[0].index;
  } else if (nonBalance.length >= 2) {
    // Look for a debit/credit pair: each mostly-empty, and rarely both populated on the
    // same row (roughly complementary).
    let bestPair: [ColumnStats, ColumnStats] | null = null;
    let bestComplementarity = -1;
    for (let i = 0; i < nonBalance.length; i++) {
      for (let j = i + 1; j < nonBalance.length; j++) {
        const a = nonBalance[i];
        const b = nonBalance[j];
        const aEmptyFrac = fraction(a.emptyCount, a.total);
        const bEmptyFrac = fraction(b.emptyCount, b.total);
        if (aEmptyFrac < 0.2 || bEmptyFrac < 0.2) continue; // both fully populated -> not a split pair
        let bothPopulated = 0;
        let eitherPopulated = 0;
        for (let r = 0; r < a.moneyValues.length; r++) {
          const av = a.moneyValues[r];
          const bv = b.moneyValues[r];
          if (av !== null || bv !== null) eitherPopulated++;
          if (av !== null && bv !== null) bothPopulated++;
        }
        const complementarity = eitherPopulated === 0 ? 0 : 1 - bothPopulated / eitherPopulated;
        if (complementarity > bestComplementarity) {
          bestComplementarity = complementarity;
          bestPair = [a, b];
        }
      }
    }
    if (bestPair && bestComplementarity > 0.7) {
      // Which is debit (spend) vs credit (income)? Without a balance column to verify,
      // fall back to "more frequently populated = debit" (people spend more often than
      // they receive money) — low-confidence, always surfaced for user confirmation.
      const [a, b] = bestPair;
      const aPopulated = a.total - a.emptyCount;
      const bPopulated = b.total - b.emptyCount;
      if (aPopulated >= bPopulated) {
        debitCol = a.index;
        creditCol = b.index;
      } else {
        debitCol = b.index;
        creditCol = a.index;
      }
      if (balanceCol === null) {
        warnings.push('Debit/credit columns were guessed without a balance column to verify against — please confirm the sign convention below.');
      }
    } else {
      // Ambiguous — pick the most fully-populated as amount, warn.
      const sorted = nonBalance.slice().sort((a, b) => a.emptyCount - b.emptyCount);
      amountCol = sorted[0]?.index ?? null;
      warnings.push('Multiple numeric columns were found and the amount column was guessed — please verify in the preview.');
    }
  }

  // --- confidence ---
  let confidence = 0;
  if (dateCol !== null) confidence += 0.35;
  if (descriptionCol !== null) confidence += 0.15;
  if (amountCol !== null) confidence += 0.35;
  else if (debitCol !== null && creditCol !== null) confidence += balanceCol !== null ? 0.35 : 0.25;
  if (balanceCol !== null) confidence += 0.15;
  confidence = Math.min(1, confidence);

  if (rowsSampled < 3) {
    confidence = Math.min(confidence, 0.5);
    warnings.push('Very few rows to sample — structural detection may be unreliable.');
  }

  const columns: ColumnProfile[] = stats.map((s) => {
    let role: ColumnRole = 'unknown';
    if (s.index === dateCol) role = 'date';
    else if (s.index === descriptionCol) role = 'description';
    else if (s.index === amountCol) role = 'amount';
    else if (s.index === debitCol) role = 'debit';
    else if (s.index === creditCol) role = 'credit';
    else if (s.index === balanceCol) role = 'balance';
    return { index: s.index, role, score: 1 };
  });

  return {
    hasHeader,
    headerRow,
    dataRows,
    columns,
    dateCol,
    descriptionCol,
    amountCol,
    debitCol,
    creditCol,
    balanceCol,
    confidence,
    warnings,
  };
}

// Re-exported for callers that just need a quick date parse alongside structural detection.
export { tryParseDate };
