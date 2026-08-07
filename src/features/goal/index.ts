/**
 * The deposit-goal tracker (docs/PERSONAL.md §0/§6) — the thing the app exists to
 * serve. `DepositGoalCard` is mounted on the dashboard by Agent P2; `GoalScreen` is
 * route content for whoever wires up its path (this feature does not own the router).
 */
export * from './projection';
export * from './bonusRateGuard';
export * from './whatIf';
export * from './currentBalance';
export * from './dateMath';
export * from './GoalProjectionChart';
export * from './BalanceEditor';
export * from './DepositGoalCard';
export * from './GoalScreen';
