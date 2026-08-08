import { chromium } from 'playwright';

const shots = '/tmp/scr3-shots';
const BASE = 'http://localhost:4176/hello/';

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  async function shot(name) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/${name}.png` });
    console.log('shot:', name);
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText('PIN', { exact: true }).first().click();
  await page.getByText('Continue', { exact: true }).click();
  await page.waitForTimeout(300);
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
  const skipBtn = page.getByLabel('Skip setup');
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(400);
  }
  await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
  await page.getByText('Load demo data', { exact: true }).click();
  await page.waitForTimeout(1200);

  await page.goto(`${BASE}#/spending/transactions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Tap the first real transaction row (not the day header).
  await page.getByText('Mecca Coffee', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await shot('edit-sheet-open');

  await browser.close();
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
