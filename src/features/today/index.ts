/**
 * Home — the summary screen (DESIGN-V4.md §1/§2). `TodayScreen` is mounted at
 * `/` by `src/app/App.tsx`. All money math is sourced from `src/money`'s
 * single `computeMonthMoney` — this feature owns the calendar/checklist
 * composition (`billsDueSoon.ts`, `toSortOut.ts`) and the presentation.
 */
export * from './billsDueSoon';
export * from './toSortOut';
export * from './EquationSection';
export * from './WhereItWentSection';
export * from './BillsDueSoonSection';
export * from './DepositPlanRow';
export * from './ToSortOutSection';
export * from './TodayScreen';
