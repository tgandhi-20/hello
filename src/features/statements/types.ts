/**
 * Statements & bill-prediction feature types, plus `RecurringSeries` / `Settings`
 * module augmentations.
 *
 * `src/types.ts` is orchestrator-owned and read-only to this feature (frozen per
 * CONTRACTS.md), so the fields this feature needs to persist onto those two
 * shared interfaces are added via TypeScript declaration merging — the same
 * pattern `src/features/routine/types.ts` already uses for `Settings`. This is
 * additive only: every new field is optional, so `DEFAULT_SETTINGS` in
 * `src/store/useStore.ts` and every existing `RecurringSeries` literal in the
 * codebase stay valid without them. Persistence itself still goes entirely
 * through the frozen §9 store API (`recurring` + `setRecurring`, `settings` +
 * `updateSettings`) — this file adds no new storage mechanism, just more
 * properties on objects the store already encrypts and writes as a whole.
 *
 * Two fields land on `RecurringSeries`:
 *   - `confirmed` — the user asked "can recurring transactions be saved too".
 *     Once true, `detectRecurring` (src/features/recurring/detect.ts) treats
 *     this series as AUTHORITATIVE: it must never silently overwrite the
 *     user's amount/cadence/nextDue/categoryId/accountId on a later detection
 *     pass, and must never drop the series even if fresh clustering no longer
 *     reproduces it. See detect.ts's own comment for the mechanics.
 *   - `accountId` — which account/card a series' charges hit. This is the
 *     field that makes per-card statement prediction possible at all; without
 *     it, a detected "Netflix" series has no way to contribute to an Amex or
 *     CBA statement projection.
 *
 * One field lands on `Settings`: a per-account statement-cycle override, so a
 * user correction to an inferred (or missing) closing/due day persists and is
 * never re-guessed out from under them.
 */
import type { AccountId, Cents, DateStr } from '@/types';

declare module '@/types' {
  interface RecurringSeries {
    /**
     * True once the user has explicitly confirmed or edited this series via
     * the statements feature's confirm/edit flow (see `confirmSeries.ts`).
     * `undefined`/`false` = still whatever the last automatic detection pass
     * produced.
     */
    confirmed?: boolean;
    /**
     * Which account/card this series' charges post to. `undefined` = not yet
     * linked — detection has no reliable way to infer this on its own (the
     * transactions it clustered may span accounts if the same merchant is
     * paid from more than one), so it starts unset and the user links it
     * when confirming.
     */
    accountId?: AccountId;
    /** Epoch ms the user last confirmed/edited this series. */
    confirmedAt?: number;
  }

  interface Settings {
    /**
     * Per-account statement-cycle override — the user's own correction to
     * (or replacement for) `cycle.ts`'s inference. Keyed by `AccountId`;
     * an absent entry means "not yet observed or overridden", which falls
     * back to inference or, failing that, an honest "unknown" rather than a
     * fabricated date.
     */
    statementCycles?: Partial<Record<AccountId, StatementCycleOverride>>;
  }
}

export interface StatementCycleOverride {
  /** Day-of-month the statement closes, 1–31 (clamped into whichever month it's applied to). */
  closingDay: number;
  /** Day-of-month payment is due, 1–31. */
  dueDay: number;
  /** Epoch ms the user set this override. */
  setAt: number;
}

/**
 * The two `AccountId`s this feature treats as credit cards with a statement
 * cycle, per the user's own plan (docs/PERSONAL.md §6/§8: "Amex due the 11th
 * ... the CBA card due the 25th"). `bankwest` holds savings, not a card;
 * `cash` isn't a bank product at all.
 *
 * HONESTY FLAG (see the report): `AccountId` has exactly one `'cba'` bucket
 * for the whole bank — CBA everyday-transaction spending and CBA-card
 * spending are structurally indistinguishable in this codebase's data model.
 * Treating every `'cba'` transaction as card spend is an assumption, made
 * because PERSONAL.md explicitly describes a CBA card with its own due date;
 * it will overstate the CBA "card" statement if the user also uses a CBA
 * everyday/debit account for non-card spending under the same account id.
 */
export const CARD_ACCOUNT_IDS: readonly AccountId[] = ['cba', 'amex'];

export function isCardAccount(accountId: AccountId | undefined): accountId is AccountId {
  return accountId !== undefined && (CARD_ACCOUNT_IDS as readonly string[]).includes(accountId);
}

export const ACCOUNT_LABEL: Record<AccountId, string> = {
  cba: 'CBA',
  bankwest: 'Bankwest',
  amex: 'Amex',
  cash: 'Cash',
};

/** Re-exported so callers don't need to import `Cents`/`DateStr` separately just to use this file's types. */
export type { Cents, DateStr };
