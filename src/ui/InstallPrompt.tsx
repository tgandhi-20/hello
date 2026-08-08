import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './Button';

/** Fired by the browser when the app is installable but not yet installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listenerAttached = false;

function attachListener(onAvailable: () => void) {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    onAvailable();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export interface InstallPromptProps {
  className?: string;
  /** Called after the user accepts or dismisses the native install dialog. */
  onResolved?: (outcome: 'accepted' | 'dismissed') => void;
}

/**
 * Renders nothing until the browser fires `beforeinstallprompt` (and hides itself once
 * installed). Drop it anywhere — Settings, an onboarding card, a banner — screens decide
 * placement; this component just owns the capture + prompt plumbing.
 */
export function InstallPrompt({ className = '', onResolved }: InstallPromptProps) {
  const [available, setAvailable] = useState(deferredPrompt !== null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    attachListener(() => setAvailable(true));
  }, []);

  if (isStandalone() || !available || dismissed) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setAvailable(false);
    onResolved?.(outcome);
  };

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-card bg-surface p-4 shadow-card',
        className,
      ].join(' ')}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint">
        <Download size={20} className="text-accent" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-1">Install Tally</p>
        <p className="text-xs text-ink-2">Add it to your home screen — works fully offline.</p>
      </div>
      <Button size="md" onClick={install} className="shrink-0">
        Install
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="flex h-12 w-12 shrink-0 items-center justify-center text-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
