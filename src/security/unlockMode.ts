/**
 * Tally — unlock mode configuration (CONTRACTS.md §5, security audit follow-up).
 *
 * THE PROBLEM THIS FIXES
 * -----------------------
 * The vault key is PBKDF2-SHA256(secret, salt, 600_000) — see crypto.ts. When
 * `secret` is a 6-digit PIN, the entire keyspace is 10^6. PBKDF2's iteration
 * count slows down each *guess*, but it cannot make the *keyspace* bigger.
 * An attacker who extracts this device's raw IndexedDB (stolen phone, rooted
 * device) can try all one million PINs offline, with no in-app backoff to
 * stop them, in well under a day on a single consumer GPU. The in-app
 * wrong-attempt backoff (LockScreen.tsx) only throttles guesses made through
 * the UI — it is real protection against "someone picked up my unlocked
 * phone and is fumbling the keypad," and no protection at all against a
 * device-extraction attack.
 *
 * THE FIX
 * -------
 * Let the secret carry more entropy. A PIN and a passphrase are BOTH just a
 * string handed to the same `deriveKey()` in crypto.ts — this file does not
 * introduce a second crypto scheme, it only changes what kind of string the
 * user is allowed to type, and gives the UI enough information (the chosen
 * `UnlockMode`) to show the right input widget.
 *
 * `UnlockConfig` is written to the plain (unencrypted) `meta` store,
 * alongside the salt and PIN verifier — like those, the *mode* is not secret
 * (knowing someone uses a passphrase, vs. a PIN, doesn't help you guess it),
 * and the lock screen needs to read it BEFORE the vault is unlocked, to know
 * whether to draw a keypad or a text field.
 */

export type UnlockMode = 'pin' | 'passphrase';

export interface UnlockConfig {
  mode: UnlockMode;
  /** Digit count for PIN mode (4–10). Ignored, but kept at a stable value, in passphrase mode. */
  pinLength: number;
}

export const DEFAULT_PIN_LENGTH = 6;
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 10;

/** Below this, a passphrase's total keyspace can be smaller than a 6-digit PIN's. */
export const MIN_PASSPHRASE_LENGTH = 8;

export const DEFAULT_UNLOCK_CONFIG: UnlockConfig = { mode: 'pin', pinLength: DEFAULT_PIN_LENGTH };

// ---------------------------------------------------------------------------
// Honest copy — CONTRACTS.md §4: "calm and factual... never shames the user."
// Shown at setup and whenever the user is choosing/switching, verbatim, so
// the two options never drift out of sync with each other.
// ---------------------------------------------------------------------------

export const PIN_TRUTH =
  'Protects you if someone picks up your unlocked phone. It will not stop someone who steals the device and copies the raw app data off it — a handful of digits can all be tried offline, in well under a day. For a lot of people that is a reasonable trade: fast, one-handed, nothing to type.';

export const PASSPHRASE_TRUTH =
  'Protects you in both cases: an unlocked phone, and a stolen device with its data copied off. Takes a few more seconds to enter. A few random words or a short sentence is stronger than a dense mix of symbols — length matters most.';

// ---------------------------------------------------------------------------
// Passphrase strength — length- and character-class-based only. No zxcvbn or
// any other dependency; this is intentionally simple and honest rather than
// falsely precise about how "crackable" a passphrase is.
// ---------------------------------------------------------------------------

export interface PassphraseStrength {
  /** 0 = empty/too short, 1 = weak, 2 = okay, 3 = good, 4 = strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

export function isWeakPassphrase(value: string): boolean {
  return value.length < MIN_PASSPHRASE_LENGTH;
}

export function estimatePassphraseStrength(value: string): PassphraseStrength {
  if (value.length === 0) return { score: 0, label: '', hint: '' };

  if (isWeakPassphrase(value)) {
    return {
      score: 0,
      label: 'Too short',
      hint: `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    };
  }

  const classes =
    (/[a-z]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0) +
    (/[0-9]/.test(value) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(value) ? 1 : 0);

  // Length does almost all of the work; character variety nudges the score up.
  let score: PassphraseStrength['score'];
  if (value.length >= 20) score = 4;
  else if (value.length >= 16) score = 3;
  else if (value.length >= 12) score = 2;
  else score = 1;

  if (classes >= 3 && score < 4) score = (score + 1) as PassphraseStrength['score'];

  const labels: Record<PassphraseStrength['score'], string> = {
    0: 'Too short',
    1: 'Weak',
    2: 'Okay',
    3: 'Good',
    4: 'Strong',
  };

  return {
    score,
    label: labels[score],
    hint:
      score < 2
        ? 'Longer is stronger — a short sentence beats a short mix of symbols.'
        : 'Length is what matters most here.',
  };
}
