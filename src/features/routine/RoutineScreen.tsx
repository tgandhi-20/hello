import React from 'react';
import { ChecklistSection } from './ChecklistSection';
import { AmexGuardrail } from './AmexGuardrail';
import { SubscriptionTruth } from './SubscriptionTruth';
import { RiskNotes } from './RiskNotes';

/**
 * The full Routine page — everything `RoutineCard` compresses for the dashboard, plus
 * the Amex guardrail, subscription truth list, and risk notes (deliverables 3–5). Not
 * wired into `src/app/**`'s router by this feature (that tree is out of this feature's
 * ownership) — exported here so whoever owns routing/navigation can add a route once,
 * the same way `RoutineCard` is exported for the dashboard to mount.
 */
export function RoutineScreen(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <ChecklistSection />
      <AmexGuardrail />
      <SubscriptionTruth />
      <RiskNotes />
    </div>
  );
}
