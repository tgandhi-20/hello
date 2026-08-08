import { chromium } from 'playwright';

const shots = '/tmp/scr3-shots';
const BASE = 'http://localhost:4176/hello/';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGE EXCEPTION:', err.message));

  async function shot(name) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${shots}/${name}.png` });
    console.log('shot:', name);
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot('00-lock-choose-mode');

  await page.getByText('PIN', { exact: true }).first().click();
  await page.getByText('Continue', { exact: true }).click();
  await page.waitForTimeout(300);
  await shot('01-lock-pin-setup');

  async function enterPin() {
    for (const d of ['1', '2', '3', '4', '5', '6']) {
      await page.getByRole('button', { name: `Digit ${d}` }).click();
      await page.waitForTimeout(60);
    }
  }
  await enterPin();
  await page.waitForTimeout(300);
  await enterPin();
  await page.waitForTimeout(700);
  await shot('02-after-unlock');

  // Skip onboarding if it appears.
  const skipBtn = page.getByLabel('Skip setup');
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(400);
  }
  await shot('03-today-empty');

  // ---- EMPTY STATES across owned screens ----
  const emptyRoutes = [
    ['spending-transactions', '/spending/transactions'],
    ['spending-trends', '/spending/trends'],
    ['spending-habits', '/spending/habits'],
    ['plan-goal', '/plan/goal'],
    ['plan-budgets', '/plan/budgets'],
    ['plan-recurring', '/plan/recurring'],
    ['plan-statements', '/plan/statements'],
    ['plan-routine', '/plan/routine'],
    ['import', '/import'],
  ];
  for (const [name, path] of emptyRoutes) {
    await page.goto(`${BASE}#${path}`, { waitUntil: 'networkidle' });
    await shot(`empty-${name}`);
  }

  // ---- Load demo data via Settings ----
  await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
  await shot('04-settings');
  const demoBtn = page.getByText('Load demo data', { exact: true });
  await demoBtn.waitFor({ state: 'visible', timeout: 10000 });
  await demoBtn.click();
  await page.waitForTimeout(1500);
  await shot('05-after-demo-data');

  // ---- POPULATED STATES ----
  const populatedRoutes = [
    ['spending-transactions', '/spending/transactions'],
    ['spending-trends', '/spending/trends'],
    ['spending-habits', '/spending/habits'],
    ['plan-goal', '/plan/goal'],
    ['plan-budgets', '/plan/budgets'],
    ['plan-recurring', '/plan/recurring'],
    ['plan-statements', '/plan/statements'],
    ['plan-routine', '/plan/routine'],
    ['today', '/'],
  ];
  for (const [name, path] of populatedRoutes) {
    await page.goto(`${BASE}#${path}`, { waitUntil: 'networkidle' });
    await shot(`full-${name}`);
  }

  // ---- Transactions: search, month nav, uncategorised queue, open sheets ----
  await page.goto(`${BASE}#/spending/transactions`, { waitUntil: 'networkidle' });
  await shot('txn-01-loaded');

  const searchBox = page.getByPlaceholder('Search merchant, description or note');
  await searchBox.fill('coffee');
  await page.waitForTimeout(300);
  await shot('txn-02-search-coffee');
  await searchBox.fill('');
  await page.waitForTimeout(200);

  // Uncategorised queue banner + sheet, if present.
  const queueBanner = page.getByText(/need(s)? a\s*$/).first();
  const anyQueue = page.locator('text=/imported transaction.*need/');
  if (await anyQueue.first().isVisible().catch(() => false)) {
    await shot('txn-03-uncategorised-banner');
    await anyQueue.first().click();
    await page.waitForTimeout(400);
    await shot('txn-04-uncategorised-sheet-open');
    // close it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('no uncategorised queue banner visible');
  }

  // Month nav: click previous month a couple times.
  const prevMonthBtn = page.getByLabel('Previous month');
  await prevMonthBtn.click();
  await page.waitForTimeout(300);
  await shot('txn-05-month-prev-1');
  await prevMonthBtn.click();
  await page.waitForTimeout(300);
  await shot('txn-06-month-prev-2');

  // Open a transaction row -> EditSheet
  const firstRow = page.locator('div[role="button"]').first();
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click();
    await page.waitForTimeout(400);
    await shot('txn-07-edit-sheet-open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Open a category picker sheet (tap "Change" inside edit sheet) - simplified: just capture a sheet elsewhere.

  await browser.close();
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
