/**
 * Shared focus-trap helper for `Sheet` and `Modal` (B2 fix — measured: tabbing
 * 15x inside the "Reset everything?" confirm walked focus out of the dialog
 * and into the bottom nav behind it. `role="dialog" aria-modal="true"` on its
 * own is a promise to assistive tech, not an enforced behaviour — the browser
 * does nothing to keep keyboard focus inside; the component has to).
 *
 * Both primitives already move focus in on open and restore it on close; the
 * missing piece was cycling Tab/Shift+Tab within the dialog while it's open.
 */

import type { KeyboardEvent } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(el: HTMLElement): boolean {
  // Cheap visibility check — good enough to exclude `display:none`/detached
  // elements without pulling in a layout-measurement library.
  return el.offsetParent !== null || el === document.activeElement;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Keydown handler to attach to a dialog container. Cycles Tab/Shift+Tab
 * between the first and last focusable descendant so focus can never escape
 * to the page behind the scrim. If focus is somehow outside `container`
 * entirely (shouldn't happen — the scrim has no focusable content — but is
 * cheap to guard), the next Tab is pulled back to the first/last item rather
 * than left to escape.
 */
export function trapTabKey(container: HTMLElement, e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const focusable = getFocusable(container);
  if (focusable.length === 0) {
    // Nothing focusable inside (shouldn't happen for a real dialog, but
    // don't let Tab leave an empty trap) — keep focus on the container itself.
    e.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (active === last || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }
}
