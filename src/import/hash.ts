/**
 * Import dedupe hashing (CONTRACTS.md §6): `sha256(date|amountCents|normalisedDescription|account)`.
 * Native WebCrypto only (CONTRACTS.md §1) — no crypto libraries, ever.
 */
import type { AccountId, Cents, DateStr } from '@/types';
import { normaliseForMatch } from '@/categorize';

function getSubtle(): SubtleCrypto {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.subtle) return g.crypto.subtle;
  throw new Error('WebCrypto (crypto.subtle) is not available in this environment.');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await getSubtle().digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute the dedupe hash for a transaction. `description` is the raw/original text —
 * it is normalised internally so the same merchant text always hashes identically,
 * matching how the categoriser sees it.
 */
export async function computeTxnHash(
  date: DateStr,
  amountCents: Cents,
  description: string,
  account: AccountId
): Promise<string> {
  const key = `${date}|${amountCents}|${normaliseForMatch(description)}|${account}`;
  return sha256Hex(key);
}
