/**
 * Thin, safe wrapper over `navigator.vibrate`. Never throws — vibration is a nice-to-have,
 * not something that should ever break a quick-add flow on a device/browser that lacks it.
 */

export type HapticPattern = 'tap' | 'success' | 'warning' | 'error' | number | number[];

const PATTERNS: Record<'tap' | 'success' | 'warning' | 'error', number | number[]> = {
  tap: 10,
  success: [10, 40, 10],
  warning: [20, 60, 20],
  error: [30, 60, 30, 60, 30],
};

function supportsVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Fire a haptic pulse. Accepts a named pattern (`'tap' | 'success' | 'warning' | 'error'`)
 * or a raw ms duration / vibration pattern array. Silently no-ops when the platform doesn't
 * support the Vibration API (e.g. iOS Safari) or the call throws for any reason.
 */
export function vibrate(pattern: HapticPattern = 'tap'): void {
  if (!supportsVibration()) return;
  try {
    const value = typeof pattern === 'string' ? PATTERNS[pattern] : pattern;
    navigator.vibrate(value);
  } catch {
    // Never let a haptic failure break the calling flow.
  }
}

/** Cancel any in-progress vibration. */
export function cancelVibration(): void {
  if (!supportsVibration()) return;
  try {
    navigator.vibrate(0);
  } catch {
    // no-op
  }
}
