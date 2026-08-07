import React from 'react';
import { Card } from '@/ui/Card';

// NOTE: CONTRACTS.md's module ownership table has no entry for a settings screen —
// PIN/biometric/lock-timeout belong conceptually to Agent 2 (Security), while
// payday/income/savings-target belong to Agent 5 (Insight, via `Settings` in types.ts).
// Flagged to the orchestrator. Agent 1 ships a minimal real screen here (not a stub) so
// the route isn't dead; whichever agent owns the fields should extend it in place.
export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <Card>
        <h2 className="mb-1 text-md font-semibold text-text-1">About</h2>
        <p className="text-sm text-text-2">
          Tally is offline-first and stores everything, encrypted, on this device only.
        </p>
      </Card>
      <p className="px-1 text-xs text-text-3">
        PIN, biometric unlock, and budget preferences will appear here.
      </p>
    </div>
  );
}
