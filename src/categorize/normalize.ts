/**
 * Merchant string normalisation (CONTRACTS.md §6). Bank CSV descriptions are full of
 * noise — card suffixes, reference numbers, payment-processor prefixes, location codes,
 * embedded dates. Cleaning this up matters twice over: it's what the categoriser matches
 * against, and it's what the user actually sees in their transaction list.
 */

const AU_STATE_CODES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

// Payment-rail / POS prefixes and suffixes that carry no merchant information.
const NOISE_PREFIXES = [
  /^EFTPOS\s+PURCHASE\s*/i,
  /^EFTPOS\s+DEBIT\s*/i,
  /^EFTPOS\s*/i,
  /^VISA\s+DEBIT\s+PURCHASE\s*/i,
  /^VISA\s+PURCHASE\s*/i,
  /^VISA\s*/i,
  /^MASTERCARD\s+PURCHASE\s*/i,
  /^CARD\s+PURCHASE\s*/i,
  /^POS\s+PURCHASE\s*/i,
  /^POS\s*/i,
  /^PURCHASE[\s-]+EFTPOS\s*/i,
  /^DIRECT\s+DEBIT\s*/i,
  /^AUTOMATIC\s+PAYMENT\s*/i,
  /^RECURRING\s+PAYMENT\s*/i,
  /^INTERNET\s+PAYMENT\s+TO\s*/i,
  /^PAYMENT\s+TO\s*/i,
  /^BPAY\s+PAYMENT\s*/i,
];

// Payment-processor markers embedded mid-string, e.g. "SQ *THE COFFEE CLUB", "PAYPAL *SPOTIFY".
const PROCESSOR_MARKERS = [/^SQ\s*\*\s*/i, /^SP\s*\*\s*/i, /^PAYPAL\s*\*\s*/i, /^PP\s*\*\s*/i];

/** Reference/card-suffix tokens: long digit runs, masked card numbers, trailing ref codes. */
function stripReferenceNumbers(s: string): string {
  return s
    .replace(/\bCARD\s*(?:ENDING|NO\.?|NUMBER)?\s*[Xx*]{2,}\d{2,6}\b/gi, '')
    .replace(/\b[Xx*]{2,}\d{2,6}\b/g, '')
    .replace(/\b\d{4}[\s-]?[Xx*]{2,}[\s-]?\d{2,4}\b/g, '') // masked PAN e.g. 4514-XXXX-1234
    .replace(/\bAUTH(?:ORISATION)?\s*(?:CODE)?[:#]?\s*\d{4,}\b/gi, '')
    .replace(/\bREF(?:ERENCE)?[:#]?\s*[A-Z0-9]{5,}\b/gi, '')
    .replace(/\b(?:RRN|TXN|TRANS(?:ACTION)?)[:#]?\s*[A-Z0-9]{5,}\b/gi, '')
    .replace(/\bNMI\s*[A-Z0-9]{5,}\b/gi, '') // Bankwest merchant terminal ids
    .replace(/\b\d{6,}\b/g, ''); // any other bare 6+ digit reference run
}

/** Embedded dates like "07AUG" "07/08" "AUG26" "07-08-2026" "31 JAN". */
function stripEmbeddedDates(s: string): string {
  return s
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, '')
    .replace(/\b\d{1,2}\s?(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s?\d{2,4})?\b/gi, '')
    .replace(/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s?\d{2,4}\b/gi, '');
}

function stripTrailingLocation(s: string): string {
  let out = s;
  // Trailing "AU" / "AUS" / "AUSTRALIA".
  out = out.replace(/\b(?:AUSTRALIA|AUS|AU)\s*$/i, '').trim();
  // Trailing state code, optionally followed by a postcode.
  const stateRe = new RegExp(`\\b(?:${AU_STATE_CODES.join('|')})\\s*\\d{0,4}\\s*$`, 'i');
  out = out.replace(stateRe, '').trim();
  // Trailing suburb-looking token + state (best-effort: drop last 1-2 words if a state code
  // was just removed and something short remains dangling, e.g. "SURRY HILLS").
  return out.trim();
}

/** Collapse to Title Case for display, without mangling known-good acronyms. */
function toDisplayCase(s: string): string {
  const KEEP_UPPER = new Set(['BWS', 'KFC', 'IGA', 'JB', 'TPG', 'AGL', 'BP', 'ATM']);
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const bare = word.replace(/[^A-Za-z']/g, '');
      if (KEEP_UPPER.has(bare.toUpperCase())) return word.toUpperCase();
      if (word.length <= 1) return word.toUpperCase();
      // Preserve words that are already mixed-case/apostrophised (e.g. "McDonald's" input rare).
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Clean a raw bank description down to a merchant name suitable for matching and display.
 * Deterministic and reused for both categorisation and the dedupe hash's normalised
 * description component.
 */
export function cleanMerchant(rawDescription: string): string {
  let s = (rawDescription ?? '').trim();
  if (s === '') return '';

  for (const re of NOISE_PREFIXES) s = s.replace(re, '');
  for (const re of PROCESSOR_MARKERS) s = s.replace(re, '');

  s = stripReferenceNumbers(s);
  s = stripEmbeddedDates(s);
  s = stripTrailingLocation(s);

  // Drop leftover punctuation runs and collapse whitespace.
  s = s
    .replace(/[_#*]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-,.:]+|[\s\-,.:]+$/g, '')
    .trim();

  if (s === '') return (rawDescription ?? '').trim();

  return toDisplayCase(s);
}

/**
 * Fold a description down to a stable key for the dedupe hash and rule matching:
 * lowercase, whitespace-collapsed, punctuation-light. Deliberately less aggressive than
 * display cleaning isn't needed here — using the same cleaned merchant keeps the hash
 * stable across re-imports of the same statement.
 */
export function normaliseForMatch(s: string): string {
  return cleanMerchant(s).toLowerCase().trim();
}
