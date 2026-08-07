/**
 * Import orchestration: ties together CSV row-splitting, structural column detection,
 * bank format hinting, sign-convention resolution, categorisation and dedupe hashing
 * into the `ImportPreview` the UI renders (CONTRACTS.md §6, §9).
 *
 * Nothing here writes to the store — `buildImportPreview` only produces the preview.
 * The screen calls `useStore().addTxns(...)` once the user confirms (CONTRACTS.md §6:
 * "Nothing is written until the user confirms.").
 */
import type { AccountId, Category, ImportPreview, Rule, Txn } from '@/types';
import { categorizeDescription } from '@/categorize';
import { parseRawCsv, yieldToUi, type RawCsv } from './csv';
import { detectStructure, type StructuralLayout, type ColumnRole } from './columns';
import { detectBankFormat, type BankFormat, type FormatDetection } from './detect';
import { analyseSignConvention, applySignConvention, rawSignedCentsForRow, type SignAnalysis } from './sign';
import { tryParseDate } from './dates';
import { computeTxnHash, dedupeGroupKey } from './hash';

export interface CsvAnalysis {
  rawCsv: RawCsv;
  layout: StructuralLayout;
  formatDetection: FormatDetection;
  signAnalysis: SignAnalysis;
  /** True when the structural read is confident enough to skip the manual mapper. */
  isConfident: boolean;
}

const CONFIDENCE_THRESHOLD = 0.65;

/** Parse raw CSV text and run structural detection, format hinting and sign analysis. */
export function analyzeCsv(text: string): CsvAnalysis {
  const rawCsv = parseRawCsv(text);
  const layout = detectStructure(rawCsv.rows);
  const formatDetection = detectBankFormat(layout);
  const signAnalysis = analyseSignConvention(layout, layout.confidence > 0 ? formatDetection.format : null);

  const isConfident =
    layout.confidence >= CONFIDENCE_THRESHOLD &&
    layout.dateCol !== null &&
    (layout.amountCol !== null || (layout.debitCol !== null && layout.creditCol !== null));

  return { rawCsv, layout, formatDetection, signAnalysis, isConfident };
}

export interface ManualColumnMapping {
  hasHeader: boolean;
  dateCol: number;
  descriptionCol: number;
  amountCol?: number;
  debitCol?: number;
  creditCol?: number;
  balanceCol?: number;
}

/** Build a `StructuralLayout` from a user-supplied manual mapping (the generic/low-confidence path). */
export function buildManualLayout(rawCsv: RawCsv, mapping: ManualColumnMapping): StructuralLayout {
  const dataRows = mapping.hasHeader ? rawCsv.rows.slice(1) : rawCsv.rows;
  const headerRow = mapping.hasHeader ? rawCsv.rows[0] ?? null : null;
  const colCount = dataRows.reduce((max, r) => Math.max(max, r.length), headerRow?.length ?? 0);

  const columns = Array.from({ length: colCount }, (_, index) => {
    let role: ColumnRole = 'unknown';
    if (index === mapping.dateCol) role = 'date';
    else if (index === mapping.descriptionCol) role = 'description';
    else if (index === mapping.amountCol) role = 'amount';
    else if (index === mapping.debitCol) role = 'debit';
    else if (index === mapping.creditCol) role = 'credit';
    else if (index === mapping.balanceCol) role = 'balance';
    return { index, role, score: 1 };
  });

  return {
    hasHeader: mapping.hasHeader,
    headerRow,
    dataRows,
    columns,
    dateCol: mapping.dateCol,
    descriptionCol: mapping.descriptionCol,
    amountCol: mapping.amountCol ?? null,
    debitCol: mapping.debitCol ?? null,
    creditCol: mapping.creditCol ?? null,
    balanceCol: mapping.balanceCol ?? null,
    confidence: 1, // user-specified — treated as fully confident
    warnings: [],
  };
}

function genId(): string {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface BuildPreviewOptions {
  account: AccountId;
  detectedFormat: BankFormat;
  signInverted: boolean;
  rules: Rule[];
  categories: Category[];
  /** Hashes already present in the store, so the preview's duplicate count is accurate before commit. */
  existingHashes: ReadonlySet<string>;
  /** Called periodically (row-batched) so the UI can show progress on large files. */
  onProgress?: (done: number, total: number) => void;
}

const YIELD_EVERY = 200;

/**
 * Build the full `ImportPreview` from a resolved structural layout: parses every row,
 * applies the sign convention, categorises, hashes for dedupe, and excludes duplicates
 * from `rows` (their count surfaces via `duplicateCount` — CONTRACTS.md §6: "Report
 * 'N new, M duplicates skipped'"). Processes in yielding batches so a large file doesn't
 * block the UI thread.
 */
export async function buildImportPreview(
  layout: StructuralLayout,
  options: BuildPreviewOptions
): Promise<ImportPreview> {
  const { account, detectedFormat, signInverted, rules, categories, existingHashes, onProgress } = options;
  const warnings: string[] = [...layout.warnings];
  const rows: Txn[] = [];
  // Per (date, amount, description, account) occurrence counter — see
  // `@/data/dedupe`'s doc comment. This is what lets two genuinely distinct
  // same-day identical rows (two coffees) hash differently instead of one
  // silently vanishing as a false "duplicate" of the other.
  const occurrenceCounts = new Map<string, number>();
  let duplicateCount = 0;
  let invalidCount = 0;

  const total = layout.dataRows.length;

  if (layout.dateCol === null || layout.descriptionCol === null) {
    warnings.push('Could not identify required columns — use the manual mapper to select date, description and amount columns.');
    return { detectedFormat, account, rows: [], duplicateCount: 0, warnings, signInverted };
  }

  for (let i = 0; i < layout.dataRows.length; i++) {
    const row = layout.dataRows[i];
    const dateStr = tryParseDate(row[layout.dateCol] ?? '');
    const rawSigned = rawSignedCentsForRow(layout, row);
    const rawDescription = row[layout.descriptionCol] ?? '';

    if (dateStr === null || rawSigned === null) {
      invalidCount++;
      continue;
    }

    const amountCents = applySignConvention(rawSigned, signInverted);
    const { merchant, categoryId } = categorizeDescription(rawDescription, rules, categories);

    const groupKey = dedupeGroupKey({ date: dateStr, amountCents, description: rawDescription, account });
    const occurrence = occurrenceCounts.get(groupKey) ?? 0;
    occurrenceCounts.set(groupKey, occurrence + 1);
    const hash = await computeTxnHash(dateStr, amountCents, rawDescription, account, occurrence);

    if (existingHashes.has(hash)) {
      duplicateCount++;
    } else {
      const now = Date.now();
      rows.push({
        id: genId(),
        date: dateStr,
        amountCents,
        description: rawDescription,
        merchant,
        categoryId,
        account,
        source: 'csv',
        hash,
        createdAt: now,
        updatedAt: now,
      });
    }

    if ((i + 1) % YIELD_EVERY === 0) {
      onProgress?.(i + 1, total);
      await yieldToUi();
    }
  }

  onProgress?.(total, total);

  if (invalidCount > 0) {
    warnings.push(`${invalidCount} row${invalidCount === 1 ? '' : 's'} could not be parsed and ${invalidCount === 1 ? 'was' : 'were'} skipped.`);
  }
  if (rows.length === 0 && duplicateCount === 0 && invalidCount === 0 && total === 0) {
    warnings.push('The file has no data rows.');
  }

  return { detectedFormat, account, rows, duplicateCount, warnings, signInverted };
}
