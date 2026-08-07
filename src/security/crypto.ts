/**
 * Tally — cryptographic primitives (CONTRACTS.md §5).
 *
 * Native WebCrypto ONLY. No crypto libraries, ever.
 *
 * Model:
 *  - The vault key is a 256-bit AES-GCM key derived from the user's secret —
 *    a numeric PIN or an alphanumeric passphrase, see `unlockMode.ts` — via
 *    PBKDF2-SHA256 with 600,000 iterations and a random 16-byte salt. `pin`
 *    is the parameter name below for historical reasons; PBKDF2 does not
 *    care whether the string it's given came off a 10-key keypad or a full
 *    keyboard. This is intentionally the ONE key-derivation path in the app —
 *    a passphrase is a higher-entropy secret fed into the same scheme, not a
 *    second crypto scheme to maintain.
 *  - That key is used directly to encrypt/decrypt every record before it
 *    touches IndexedDB. It is marked `extractable` for exactly one reason:
 *    `subtle.wrapKey`/`unwrapKey` (used by biometric.ts) require the key
 *    being wrapped to be extractable. Extractable does NOT mean persisted —
 *    the key still only ever lives in a JS variable for the life of the tab.
 *  - The key is NEVER written to IndexedDB, localStorage, or anywhere else.
 *    Only ciphertext (record blobs) and, for biometric convenience, a
 *    *wrapped* copy of the key (itself unreadable without the wrapping
 *    secret — see biometric.ts) are persisted.
 *
 * Nobody outside src/security/** and src/store/** should import this file.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Fixed known-plaintext used to verify a PIN/derived key is correct without decrypting real data. */
const VERIFIER_MARKER = 'tally-verifier-v1';

export interface EncryptedBlob {
  /** base64-encoded 12-byte random IV, unique per encryption call. */
  iv: string;
  /** base64-encoded AES-GCM ciphertext (includes the auth tag). */
  ct: string;
}

// ---------------------------------------------------------------------------
// base64 <-> ArrayBuffer helpers
// ---------------------------------------------------------------------------

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/** Generate a fresh random 16-byte salt. Call once, at PIN setup. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * Derive the 256-bit AES-GCM vault key from a secret (PIN or passphrase) + salt.
 * PBKDF2-SHA256, 600,000 iterations, per CONTRACTS.md §5.
 *
 * `extractable: true` so the key can later be wrapped (biometric.ts) — see
 * the module doc comment above for why that's safe.
 */
export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// ---------------------------------------------------------------------------
// Record encryption
// ---------------------------------------------------------------------------

/** Encrypt any JSON-serialisable value with a fresh random IV. */
export async function encryptJSON(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext);
  return { iv: bufToBase64(iv), ct: bufToBase64(ct) };
}

/** Decrypt a blob produced by `encryptJSON`. Throws if the key is wrong or the blob is corrupt. */
export async function decryptJSON<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  const iv = base64ToBuf(blob.iv);
  const ct = base64ToBuf(blob.ct);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext)) as T;
}

// ---------------------------------------------------------------------------
// PIN verifier — lets us tell "wrong PIN" from "corrupt data" without ever
// decrypting real records with an unverified key.
// ---------------------------------------------------------------------------

export async function makeVerifier(key: CryptoKey): Promise<EncryptedBlob> {
  return encryptJSON(key, { marker: VERIFIER_MARKER });
}

/** Returns true iff `key` correctly decrypts `blob` to the expected marker. Never throws. */
export async function checkVerifier(key: CryptoKey, blob: EncryptedBlob): Promise<boolean> {
  try {
    const out = await decryptJSON<{ marker: string }>(key, blob);
    return out.marker === VERIFIER_MARKER;
  } catch {
    // AES-GCM authentication failure (wrong key) or malformed JSON — either way, no.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Key wrapping — used by biometric.ts to stash the vault key behind a
// WebAuthn-derived secret instead of the PIN.
// ---------------------------------------------------------------------------

export interface WrappedKeyBlob {
  iv: string;
  wrapped: string;
}

/** Wrap `keyToWrap` (the vault key) with `wrappingKey` (a PRF-derived AES-GCM key). */
export async function wrapVaultKey(
  keyToWrap: CryptoKey,
  wrappingKey: CryptoKey
): Promise<WrappedKeyBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', keyToWrap, wrappingKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return { iv: bufToBase64(iv), wrapped: bufToBase64(wrapped) };
}

/** Reverse `wrapVaultKey`. Returns the vault key as a usable AES-GCM CryptoKey. */
export async function unwrapVaultKey(
  blob: WrappedKeyBlob,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const iv = base64ToBuf(blob.iv);
  const wrapped = base64ToBuf(blob.wrapped);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

/** Import raw key bytes (e.g. a WebAuthn PRF secret) as an AES-GCM key usable for wrap/unwrap only. */
export async function importRawAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

// ---------------------------------------------------------------------------
// Hashing — used for import dedupe (CONTRACTS.md §6):
// hash = sha256(date|amountCents|normalisedDescription|account)
// ---------------------------------------------------------------------------

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ---------------------------------------------------------------------------
// In-memory active key holder
// ---------------------------------------------------------------------------

let activeKey: CryptoKey | null = null;

/** The current unlocked vault key, or null when locked. Never persisted. */
export function getActiveKey(): CryptoKey | null {
  return activeKey;
}

export function setActiveKey(key: CryptoKey): void {
  activeKey = key;
}

/** Drop the in-memory reference to the vault key. Called on every lock. */
export function zeroKey(): void {
  activeKey = null;
}

// ---------------------------------------------------------------------------
// Misc helpers shared with other security/store modules
// ---------------------------------------------------------------------------

export function randomBytesBase64(length: number): string {
  return bufToBase64(crypto.getRandomValues(new Uint8Array(length)));
}

export { bufToBase64, base64ToBuf };
