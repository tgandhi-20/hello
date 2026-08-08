import React from 'react';
import { AlertTriangle, RotateCcw, ShieldCheck } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { todayStr } from './format';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Short label for what crashed, e.g. a screen title ("Log"). Shown as
   * "Log hit a snag" — never render the actual error/stack to the user.
   */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render-time errors in the wrapped subtree so a bug in one screen
 * never takes the whole app down to a blank white screen — catastrophic for
 * an app holding someone's only copy of their financial data. Shows a calm,
 * non-technical message with two recovery paths ("Try again" / "Reload the
 * app") plus a rescue "Export encrypted backup" button, so a user who hits a
 * render bug can still get their data off the device before doing anything
 * drastic.
 *
 * Mount this around routed screen content (so a crash there doesn't take out
 * the shell/nav) and, separately, around the app's top-level tree as a
 * last-resort catch-all — see `src/app/App.tsx` and
 * `src/app/shell/AppShell.tsx`.
 *
 * Deliberately never logs the caught error anywhere, not even in
 * development: an error's message or stack can easily close over a
 * transaction, merchant name, or amount, and CONTRACTS.md §5's "never
 * console.log a transaction, amount, merchant, PIN, or key" applies to crash
 * paths too, not just the happy path.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Deliberately empty. See the class doc comment above for why this
    // never console.logs the error/errorInfo it receives.
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback label={this.props.label} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

type ExportState = 'idle' | 'busy' | 'done' | 'failed';

function ErrorFallback({ label, onRetry }: { label?: string; onRetry: () => void }): React.ReactElement {
  const [exportState, setExportState] = React.useState<ExportState>('idle');

  async function handleExport(): Promise<void> {
    setExportState('busy');
    try {
      // Read the store imperatively (outside React) rather than via the
      // `useStore` hook — the fallback UI must work even though it rendered
      // because *something* in the component tree just threw, so it avoids
      // any dependency beyond "the store module itself still works".
      const blob = await useStore.getState().exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-backup-${todayStr()}.tally`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportState('done');
    } catch {
      // Never surface the underlying error message — it could be
      // "Tally is locked" (fine) or could, in principle, wrap something
      // that quotes user data. Keep the failure copy generic either way.
      setExportState('failed');
    }
  }

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 py-12 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunk">
        <AlertTriangle size={28} strokeWidth={1.75} className="text-caution" aria-hidden="true" />
      </div>
      <div>
        <h2 className="title">{label ? `${label} hit a snag` : 'Something went wrong'}</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">
          This screen ran into a problem. Your data is still encrypted and safe on this device — nothing
          has been lost.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exportState === 'busy'}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-control bg-accent px-4 text-md font-medium text-ink-on-accent transition-[transform,background-color,opacity] duration-180 ease-standard active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
        >
          <ShieldCheck size={18} aria-hidden="true" />
          {exportState === 'busy' ? 'Exporting…' : exportState === 'done' ? 'Backup saved' : 'Export encrypted backup'}
        </button>
        {exportState === 'failed' ? (
          <p className="text-xs text-critical">
            Couldn&rsquo;t export right now — try Reload below, then Settings → Export backup once Tally is
            open again.
          </p>
        ) : null}
        {exportState === 'done' ? (
          <p className="text-xs text-accent">Saved to your downloads. Safe to reload now.</p>
        ) : null}

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-control border border-hairline bg-transparent px-4 text-md font-medium text-ink-1 transition-colors duration-180 ease-standard active:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="flex min-h-[48px] items-center justify-center gap-2 text-sm font-medium text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Try again without reloading
        </button>
      </div>
    </div>
  );
}
