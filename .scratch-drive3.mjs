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

  // Reload — the derived key lives only in memory, so a reload should show the
  // recurring "Enter PIN" unlock screen (not the first-run choose-mode screen).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await shot('lock-02-recurring-unlock');

  // "Trouble unlocking?" -> RecoverySheet
  const troubleBtn = page.getByText('Trouble unlocking?', { exact: true });
  await troubleBtn.click();
  await page.waitForTimeout(400);
  await shot('lock-03-recovery-sheet');

  // erase view (informational only, do NOT confirm)
  const eraseBtn = page.getByText('Erase this device and start fresh', { exact: true });
  if (await eraseBtn.isVisible().catch(() => false)) {
    await eraseBtn.click();
    await page.waitForTimeout(400);
    await shot('lock-04-recovery-erase-view');
  }

  await browser.close();
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
