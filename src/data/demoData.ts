/**
 * Tally — demo data generator (CONTRACTS.md deliverable 8), personalised.
 *
 * A realistic 5-week window ending today, tuned to match the user's own July
 * 2026 analysis (docs/PERSONAL.md §4): food ~50% of spend, eating-out vs
 * groceries roughly 92/8, one dominant café (~22 visits at ~$5.76), Sydney
 * merchants, the four real subscriptions (§5), salary on the 15th (§2).
 *
 * This is randomised, not deterministic — every run lands close to, not
 * exactly on, PERSONAL.md's figures. The probabilities and amount ranges
 * below are calibrated so the EXPECTED (not guaranteed) totals are close:
 * see the per-block comments for the arithmetic. Category *targets* (~$471
 * eating out, ~$462 lunch, ~$267 coffee, ~$101 groceries, ~$309 transport,
 * over 5 weeks) are §4's illustrative July actuals, not §3's forward-looking
 * budget caps — they intentionally sit ABOVE the caps, because that
 * historical overspend is *why* the caps exist.
 *
 * No rent/utilities/sublet transactions are generated: PERSONAL.md §7 is
 * explicit that those stay inactive until Settings.moveInDate is set, and
 * this generator has no such date to work from (the store hasn't necessarily
 * been asked). Once a real vault has moveInDate set, real transactions (or
 * src/personal/applyPersonalPlan.ts's seeded subscriptions/budgets) carry
 * housing, not demo data.
 *
 * Subscriptions are seeded as the four REAL ones (§5, $36.17/mo total), not
 * the misleading $206/$238 figure from the source analysis (which §5 says
 * was almost entirely two one-off Anthropic charges) — reproducing a number
 * the user's own plan explicitly calls "wrong" would just re-import the
 * confusion this whole feature exists to resolve.
 *
 * All amounts are integer cents. Positive = spend, negative = income, per
 * CONTRACTS.md §3 / src/types.ts.
 */
import type { AccountId, Cents, Category, DateStr, Txn } from '@/types';
import { addDays, todayStr } from '@/ui/format';
import { INCOME, KNOWN_SUBSCRIPTIONS, PERSONAL_CATEGORIES, CATEGORY_IDS } from '@/personal/plan';

/**
 * Matches the store's `addTxns` input type exactly. `hash` is included only
 * because CONTRACTS.md's frozen `Omit<Txn,'id'|'createdAt'|'updatedAt'>` type
 * still requires it — the store recomputes and overwrites it authoritatively
 * (see useStore.ts), so the placeholder value here is never trusted.
 */
export type DemoTxnSeed = Omit<Txn, 'id' | 'createdAt' | 'updatedAt'>;

// One dominant café (§4: "one cafe alone: 22 visits at $5.76") plus a rotating
// cast of others for second coffees / variety. All real Sydney cafés.
const MAIN_CAFE = 'Mecca Coffee';
const OTHER_CAFES = [
  'Reuben Hills',
  'Coffee Alchemy',
  'Locale Espresso',
  'Brew Bar',
  'Campos Coffee',
  "Toby's Estate",
  'Single Origin Roasters',
];

const LUNCH_SPOTS = [
  'Soul Origin',
  'Guzman y Gomez',
  'Sushi Hub',
  'Zambrero',
  "Grill'd",
  "Betty's Burgers",
  "Roll'd",
  'Boost Juice',
];

// "Restaurants & delivery" per §4's table — dine-in Sydney spots plus the
// delivery apps named in CONTRACTS.md §6's merchant dictionary.
const DINNER_SPOTS = ['Chat Thai', 'Mamak', "Rashay's", 'Chin Chin', 'Golden Century'];
const DELIVERY_APPS = ['Uber Eats', 'DoorDash', 'Menulog'];

const GROCERS = ['Coles', 'Woolworths'];
const SHOPPING_MERCHANTS = ['Kmart', 'JB Hi-Fi', 'Officeworks'];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}
function dow(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = Sunday
}
function isWeekday(date: DateStr): boolean {
  const d = dow(date);
  return d >= 1 && d <= 5;
}

function seed(
  date: DateStr,
  amountCents: Cents,
  description: string,
  merchant: string,
  categoryId: string,
  account: AccountId,
  source: Txn['source']
): DemoTxnSeed {
  return { date, amountCents, description, merchant, categoryId, account, source, hash: '' };
}

function capOf(id: string): Cents {
  return PERSONAL_CATEGORIES.find((c) => c.id === id)?.capCents ?? 0;
}

/**
 * Generate a realistic 5-week (35-day) transaction history ending today —
 * the same window PERSONAL.md §4 analyses. `categories` is passed in so
 * category ids line up with whatever the store actually has seeded
 * (built-ins, by default — see src/data/defaultCategories.ts).
 */
export function generateDemoTxns(categories: Category[]): DemoTxnSeed[] {
  const byId = (id: string) => categories.find((c) => c.id === id)?.id ?? id;
  const cat = {
    groceries: byId(CATEGORY_IDS.groceries),
    coffee: byId(CATEGORY_IDS.coffee),
    lunch: byId(CATEGORY_IDS.lunch),
    eatingOut: byId(CATEGORY_IDS.eatingOut),
    transport: byId(CATEGORY_IDS.transport),
    phone: byId(CATEGORY_IDS.phone),
    health: byId(CATEGORY_IDS.health),
    family: byId(CATEGORY_IDS.family),
    shopping: byId(CATEGORY_IDS.shopping),
    skincare: byId(CATEGORY_IDS.skincare),
    subscriptions: byId(CATEGORY_IDS.subscriptions),
    income: byId(CATEGORY_IDS.income),
  };

  const today = todayStr();
  const start = addDays(today, -34); // 5 weeks inclusive, matching §4's analysis window
  const out: DemoTxnSeed[] = [];

  // --- Daily "logged in the moment" spend: coffee, lunch, eating out, groceries, transport. ---
  // A 5-week window has 25 weekdays + 10 weekend days. Probabilities below are
  // chosen so the EXPECTED counts/totals land close to §4's July figures —
  // see each line's target comment. Individual runs vary; that's the point of
  // a randomised demo generator, not a bug.
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const weekday = isWeekday(d);

    // Coffee — target ~22 Mecca visits @ ~$5.76 (§4's headline stat) + a
    // secondary café/coffee some days. E[Mecca] = 25*0.78 + 10*0.25 ≈ 22.
    if (Math.random() < (weekday ? 0.78 : 0.25)) {
      out.push(seed(d, rand(560, 595), 'Coffee', MAIN_CAFE, cat.coffee, 'cash', 'manual'));
    }
    if (Math.random() < (weekday ? 0.35 : 0.05)) {
      out.push(seed(d, rand(480, 750), 'Coffee', pick(OTHER_CAFES), cat.coffee, 'cash', 'manual'));
    }

    // Lunch — weekdays, target ~$462/5wk. E[count] = 25*0.9 ≈ 22-23.
    if (weekday && Math.random() < 0.9) {
      out.push(seed(d, rand(1500, 2800), 'Lunch', pick(LUNCH_SPOTS), cat.lunch, 'cash', 'manual'));
    }

    // Eating out (restaurants & delivery) — target ~$471/5wk. Weekend dinners
    // + occasional weeknight delivery.
    if (!weekday && Math.random() < 0.75) {
      out.push(seed(d, rand(2800, 6500), 'Dinner', pick(DINNER_SPOTS), cat.eatingOut, 'amex', 'manual'));
    } else if (weekday && Math.random() < 0.15) {
      out.push(seed(d, rand(2500, 4500), 'Delivery', pick(DELIVERY_APPS), cat.eatingOut, 'amex', 'manual'));
    }

    // Groceries — small, infrequent top-ups. Target ~$101/5wk — essentially
    // every meal is bought ready-made (§4's 92/8 eating-out-vs-groceries split).
    if (Math.random() < 0.16) {
      const store = pick(GROCERS);
      out.push(seed(d, rand(1200, 3500), store.toUpperCase(), store, cat.groceries, 'cba', 'csv'));
    }

    // Transport — Opal most weekdays, occasional second tap, weekend Uber. Target ~$309/5wk.
    if (weekday && Math.random() < 0.88) {
      out.push(seed(d, rand(420, 650), 'OPAL', 'Opal', cat.transport, 'bankwest', 'manual'));
    }
    if (weekday && Math.random() < 0.35) {
      out.push(seed(d, rand(420, 650), 'OPAL', 'Opal', cat.transport, 'bankwest', 'manual'));
    }
    if (!weekday && Math.random() < 0.5) {
      out.push(seed(d, rand(1500, 3500), 'UBER TRIP', 'Uber', cat.transport, 'amex', 'manual'));
    }
  }

  // --- Salary: 15th, the real net take-home (§2). ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (d.endsWith('-15')) {
      out.push(seed(d, -INCOME.netMonthlyCents, 'SALARY', 'Salary', cat.income, 'cba', 'csv'));
    }
  }

  // --- Family support: sent home monthly (§3). ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (d.endsWith('-02')) {
      out.push(seed(d, capOf(CATEGORY_IDS.family), 'INTERNATIONAL TRANSFER', 'Family', cat.family, 'cba', 'csv'));
    }
  }

  // --- Phone: was missing from the original budget entirely (§3) — a real
  // bill, historically higher than the new $81 cap (§4's July figure: $176/5wk). ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (d.endsWith('-20')) {
      out.push(seed(d, 17_600, 'TELSTRA', 'Telstra', cat.phone, 'amex', 'csv'));
    }
  }

  // --- Health: Bupa, fortnightly direct debit (§3/§4 — 2 * $76 ≈ July's $152/5wk). ---
  let healthCursor = addDays(start, 3);
  while (healthCursor <= today) {
    out.push(seed(healthCursor, 7_600, 'BUPA', 'Bupa', cat.health, 'bankwest', 'csv'));
    healthCursor = addDays(healthCursor, 14);
  }

  // --- Subscriptions: the four known, real ones (§5) on their assumed billing days. ---
  for (const sub of KNOWN_SUBSCRIPTIONS) {
    for (let d = start; d <= today; d = addDays(d, 1)) {
      if (Number(d.slice(-2)) === sub.billingDayOfMonth) {
        out.push(seed(d, sub.amountCents, sub.merchant.toUpperCase(), sub.merchant, cat.subscriptions, 'amex', 'csv'));
      }
    }
  }

  // --- Shopping + skincare: light, occasional. ---
  out.push(seed(addDays(start, 9), 4200, pick(SHOPPING_MERCHANTS).toUpperCase(), pick(SHOPPING_MERCHANTS), cat.shopping, 'amex', 'csv'));
  out.push(seed(addDays(start, 24), 3300, pick(SHOPPING_MERCHANTS).toUpperCase(), pick(SHOPPING_MERCHANTS), cat.shopping, 'amex', 'csv'));
  out.push(seed(addDays(start, 15), 3500, 'CHEMIST WAREHOUSE', 'Chemist Warehouse', cat.skincare, 'amex', 'csv'));

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
