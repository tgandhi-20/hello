/**
 * Low-level CSV parsing: delimiter sniffing and raw-matrix extraction via `papaparse`.
 * No column semantics here — see `columns.ts` for structural role detection.
 *
 * Row-splitting itself is cheap even at several thousand rows (milliseconds); the parts
 * of the import pipeline that could plausibly stall the main thread — per-row hashing and
 * categorisation — are chunked with explicit yields in `parse.ts` instead of here.
 */
import Papa from 'papaparse';

export interface RawCsv {
  /** Every row as an array of trimmed string cells. Ragged rows are padded with ''. */
  rows: string[][];
  delimiter: string;
  /** Parse errors papaparse surfaced (bad quoting, etc.) — worth showing as warnings. */
  errors: string[];
}

/** Parse raw CSV/TSV text into a rectangular matrix of trimmed string cells. */
export function parseRawCsv(text: string): RawCsv {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  });

  const width = result.data.reduce((max, row) => Math.max(max, row.length), 0);
  const rows = result.data
    .filter((row) => row.length > 0)
    .map((row) => {
      const padded = row.slice(0, width).map((cell) => (cell ?? '').trim());
      while (padded.length < width) padded.push('');
      return padded;
    });

  return {
    rows,
    delimiter: result.meta.delimiter || ',',
    errors: result.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`),
  };
}

/**
 * Read a `File` (from a drop/pick input) as text. Wrapped so the import feature never
 * touches `FileReader` directly.
 */
export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

/** Yield control back to the event loop / paint. Used to keep large-file processing from freezing the UI. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    const w = typeof window !== 'undefined' ? window : undefined;
    if (w && 'requestAnimationFrame' in w) {
      w.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}
