/**
 * Tally — demo data generator (CONTRACTS.md deliverable 8).
 *
 * ~3 months of plausible Australian spending, ending today. This is what a
 * brand-new user sees when they tap "Load demo data" from Settings, so it
 * needs to look like a real life, not a spec — real café names, real
 * fortnightly grocery rhythm, a believable salary credit.
 *
 * All amounts are integer cents. Positive = spend, negative = income, per
 * CONTRACTS.md §3.
 */
import type { AccountId, Cents, Category, DateStr, Txn } from '@/types';
import { addDays, todayStr } from '@/ui/format';

/**
 * Matches the store's `addTxns` input type exactly. `hash` is included only
 * because CONTRACTS.md's frozen `Omit<Txn,'id'|'createdAt'|'updatedAt'>` type
 * still requires it — the store recomputes and overwrites it authoritatively
 * (see useStore.ts), so the placeholder value here is never trusted.
 */
export type DemoTxnSeed = Omit<Txn, 'id' | 'createdAt' | 'updatedAt'>;

const CAFES = [
  'Mecca Coffee',
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

const DINNER_SPOTS = [
  'Chat Thai',
  'Mamak',
  "Rashay's",
  'The Meatball & Wine Bar',
  "Mary's Burgers",
  'Chin Chin',
  'Nomad',
  'Golden Century',
];

const GROCERS = ['Coles', 'Woolworths'];
const UTILITIES = ['AGL', 'Origin Energy'];
const FUEL_STATIONS = ['Ampol', 'BP', '7-Eleven'];

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

/**
 * Generate a realistic ~90-day transaction history ending today.
 * `categories` is passed in so category ids line up with whatever the store
 * actually has seeded (built-ins, by default).
 */
export function generateDemoTxns(categories: Category[]): DemoTxnSeed[] {
  const byId = (id: string) => categories.find((c) => c.id === id)?.id ?? id;
  const cat = {
    rent: byId('cat-rent'),
    utilities: byId('cat-utilities'),
    groceries: byId('cat-groceries'),
    coffee: byId('cat-coffee'),
    lunch: byId('cat-lunch'),
    diningOut: byId('cat-dining-out'),
    transport: byId('cat-transport'),
    fuel: byId('cat-fuel'),
    subscriptions: byId('cat-subscriptions'),
    income: byId('cat-income'),
  };

  const today = todayStr();
  const start = addDays(today, -89);
  const out: DemoTxnSeed[] = [];

  // --- Rent: monthly, 1st of the month, direct debit from CBA. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (d.endsWith('-01')) {
      out.push(seed(d, 245000, 'RENT PAYMENT', 'Rent', cat.rent, 'cba', 'csv'));
    }
  }

  // --- Salary: monthly credit around the 15th (negative = income). ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (d.endsWith('-15')) {
      out.push(seed(d, -620000, 'SALARY ACME PTY LTD', 'Acme Pty Ltd', cat.income, 'cba', 'csv'));
    }
  }

  // --- Utilities: roughly every 28 days, alternating retailer. ---
  let utilCursor = addDays(start, 4);
  let utilToggle = 0;
  while (utilCursor <= today) {
    out.push(
      seed(
        utilCursor,
        rand(11000, 22000),
        `${UTILITIES[utilToggle % 2]} ELECTRICITY`,
        UTILITIES[utilToggle % 2],
        cat.utilities,
        'bankwest',
        'csv'
      )
    );
    utilToggle++;
    utilCursor = addDays(utilCursor, 28);
  }

  // --- Subscriptions: Netflix + Spotify, monthly, fixed-ish days. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (d.endsWith('-05')) {
      out.push(seed(d, 1699, 'NETFLIX.COM', 'Netflix', cat.subscriptions, 'amex', 'csv'));
    }
    if (d.endsWith('-09')) {
      out.push(seed(d, 1299, 'SPOTIFY AU', 'Spotify', cat.subscriptions, 'amex', 'csv'));
    }
  }

  // --- Groceries: a big weekly shop (Fri/Sat) + occasional midweek top-up. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = dow(d);
    if (day === 5 || day === 6) {
      if (Math.random() < 0.6) {
        const store = pick(GROCERS);
        out.push(seed(d, rand(9500, 15500), store.toUpperCase(), store, cat.groceries, 'cba', 'csv'));
      }
    } else if (day === 2 && Math.random() < 0.35) {
      const store = pick(GROCERS);
      out.push(seed(d, rand(1800, 4500), store.toUpperCase(), store, cat.groceries, 'cba', 'csv'));
    }
  }

  // --- Fuel: roughly fortnightly. ---
  let fuelCursor = addDays(start, 6);
  while (fuelCursor <= today) {
    const station = pick(FUEL_STATIONS);
    out.push(seed(fuelCursor, rand(6500, 9800), `${station.toUpperCase()} FUEL`, station, cat.fuel, 'bankwest', 'csv'));
    fuelCursor = addDays(fuelCursor, rand(12, 16));
  }

  // --- Transport: Opal taps on weekdays, occasional Uber on weekends. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = dow(d);
    if (day >= 1 && day <= 5 && Math.random() < 0.75) {
      out.push(seed(d, rand(420, 890), 'OPAL', 'Opal', cat.transport, 'cba', 'manual'));
    }
    if ((day === 5 || day === 6) && Math.random() < 0.25) {
      out.push(seed(d, rand(1400, 3200), 'UBER TRIP', 'Uber', cat.transport, 'amex', 'csv'));
    }
  }

  // --- Coffee: most weekdays, some weekends, logged manually as they happen. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = dow(d);
    const chance = day >= 1 && day <= 5 ? 0.85 : 0.45;
    if (Math.random() < chance) {
      const cafe = pick(CAFES);
      out.push(seed(d, rand(480, 620), 'Coffee', cafe, cat.coffee, 'cash', 'manual'));
    }
    // Occasional second coffee.
    if (day >= 1 && day <= 5 && Math.random() < 0.2) {
      const cafe = pick(CAFES);
      out.push(seed(d, rand(480, 620), 'Coffee', cafe, cat.coffee, 'cash', 'manual'));
    }
  }

  // --- Lunch: weekdays, logged manually. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = dow(d);
    if (day >= 1 && day <= 5 && Math.random() < 0.8) {
      const spot = pick(LUNCH_SPOTS);
      out.push(seed(d, rand(1600, 2200), 'Lunch', spot, cat.lunch, 'cash', 'manual'));
    }
  }

  // --- Dining out: weekend dinners, occasional weeknight. ---
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = dow(d);
    if ((day === 5 || day === 6) && Math.random() < 0.55) {
      const spot = pick(DINNER_SPOTS);
      out.push(seed(d, rand(3800, 9200), 'Dinner', spot, cat.diningOut, 'amex', 'manual'));
    } else if (day >= 1 && day <= 4 && Math.random() < 0.12) {
      const spot = pick(DINNER_SPOTS);
      out.push(seed(d, rand(2800, 5500), 'Dinner', spot, cat.diningOut, 'amex', 'manual'));
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
