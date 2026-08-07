/**
 * Tally — biometric convenience unlock via WebAuthn (CONTRACTS.md §5).
 *
 * WHAT THIS ACTUALLY DOES
 * ------------------------
 * There is no server, so a normal WebAuthn "assertion succeeded" check proves
 * nothing on its own — a page could just skip the check. To make the
 * fingerprint sensor genuinely *necessary* (not theatre), this uses the
 * WebAuthn **PRF extension**: on a supported platform authenticator (Chrome/
 * Android with a TEE-backed authenticator, which the S26 Ultra has), each
 * successful user-verified assertion deterministically returns a 32-byte
 * secret tied to that specific credential + device + fingerprint enrollment.
 * We use that secret as an AES-GCM key that WRAPS the real vault key
 * (crypto.ts's `wrapVaultKey`/`unwrapVaultKey`). Nothing about the PIN or
 * the vault key is derivable from the wrapped blob without the secret, and
 * the secret is never exposed to script except as an opaque wrapping key.
 *
 * WHAT THIS DOES **NOT** PROTECT AGAINST
 * ------------------------------------
 * - A rooted/compromised device: if the OS or browser itself is compromised,
 *   an attacker can call the same WebCrypto/WebAuthn APIs this code calls,
 *   or dump process memory while the app is unlocked. Biometrics raise the
 *   bar for a casual "picked up my unlocked phone" attacker; they do not
 *   defend against a fully compromised device.
 * - There is no attestation verification (no server to verify it against),
 *   so we don't try to prove the authenticator is genuine hardware — we
 *   only rely on it to gate the PRF secret behind the platform's own
 *   biometric prompt.
 * - The PIN remains the actual root of trust: if biometric is unavailable,
 *   we fall back to the PIN — see below.
 *
 * GRACEFUL DEGRADATION
 * ---------------------
 * Every function here returns `null`/`false` on any failure — unsupported
 * browser, no platform authenticator, PRF extension unsupported, user
 * cancelled, timeout, whatever. Callers (the store) MUST treat that as
 * "fall back to PIN", never as an error to surface. A biometric failure must
 * never lock the user out of their own data — the PIN always works.
 */
import {
  bufToBase64,
  base64ToBuf,
  importRawAesKey,
  wrapVaultKey,
  unwrapVaultKey,
  type WrappedKeyBlob,
} from './crypto';

export interface BiometricRegistration {
  /** base64 WebAuthn credential id — used to target the assertion request. */
  credentialIdB64: string;
  /** base64 32-byte salt fed into the PRF extension. Not secret; just needs to stay stable. */
  prfSaltB64: string;
}

function toArrayBuffer(bs: BufferSource): ArrayBuffer {
  if (bs instanceof ArrayBuffer) return bs;
  return bs.buffer.slice(bs.byteOffset, bs.byteOffset + bs.byteLength) as ArrayBuffer;
}

/** Feature-detect a platform (built-in) authenticator, e.g. the S26 Ultra's fingerprint sensor. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a resident (discoverable) platform credential with the PRF extension.
 * Returns null if the platform authenticator, or its PRF support, is unavailable,
 * or if the user cancels — callers fall back to PIN in every case.
 */
export async function registerBiometricCredential(): Promise<BiometricRegistration | null> {
  if (!(await isBiometricAvailable())) return null;

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge as BufferSource,
        rp: { name: 'Tally' },
        user: { id: userId as BufferSource, name: 'tally-local', displayName: 'Tally' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          requireResidentKey: true,
          userVerification: 'required',
        },
        timeout: 60_000,
        attestation: 'none',
        extensions: { prf: {} },
      },
    })) as PublicKeyCredential | null;

    if (!credential) return null;

    const results = credential.getClientExtensionResults();
    if (!results.prf?.enabled) {
      // Platform authenticator exists but doesn't support the PRF extension (older
      // Android/Chrome, or a non-PRF authenticator). We have no server to fall back
      // to for key wrapping, so biometric unlock genuinely can't work here —
      // report unavailable rather than pretend to secure anything.
      return null;
    }

    return { credentialIdB64: bufToBase64(credential.rawId), prfSaltB64: bufToBase64(prfSalt) };
  } catch {
    return null;
  }
}

/** Run a user-verified assertion and pull out the PRF secret. Null on any failure. */
async function getPrfSecret(reg: BiometricRegistration): Promise<ArrayBuffer | null> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credentialId = base64ToBuf(reg.credentialIdB64);
    const prfSalt = base64ToBuf(reg.prfSaltB64);

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge as BufferSource,
        allowCredentials: [{ id: credentialId as BufferSource, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
        extensions: { prf: { eval: { first: prfSalt as BufferSource } } },
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return null;

    const results = assertion.getClientExtensionResults();
    const secret = results.prf?.results?.first;
    if (!secret) return null;
    return toArrayBuffer(secret);
  } catch {
    // NotAllowedError (user cancelled/timed out), device without a sensor,
    // no matching credential, etc. — all treated the same: unavailable now.
    return null;
  }
}

/** Wrap the vault key behind the biometric-derived secret. Null on any failure. */
export async function wrapKeyWithBiometric(
  vaultKey: CryptoKey,
  reg: BiometricRegistration
): Promise<WrappedKeyBlob | null> {
  const secret = await getPrfSecret(reg);
  if (!secret) return null;
  try {
    const wrappingKey = await importRawAesKey(secret);
    return await wrapVaultKey(vaultKey, wrappingKey);
  } catch {
    return null;
  }
}

/** Reverse of `wrapKeyWithBiometric` — prompts for a fresh biometric check. Null on any failure. */
export async function unwrapKeyWithBiometric(
  reg: BiometricRegistration,
  wrapped: WrappedKeyBlob
): Promise<CryptoKey | null> {
  const secret = await getPrfSecret(reg);
  if (!secret) return null;
  try {
    const wrappingKey = await importRawAesKey(secret);
    return await unwrapVaultKey(wrapped, wrappingKey);
  } catch {
    return null;
  }
}
