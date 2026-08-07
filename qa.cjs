const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOT_DIR = '/home/user/hello/qa-screenshots';
const BASE = 'http://localhost:4173/hello/';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const S26 = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 3.5,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function collectConsole(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      bucket.push(`[console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    bucket.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    bucket.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      bucket.push(`[http${res.status()}] ${res.url()}`);
    }
  });
}

async function grepNaN(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const matches = [];
    const re = /(NaN|Infinity|-Infinity|undefined|null)\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - 25);
      const end = Math.min(text.length, m.index + 25);
      matches.push(text.slice(start, end).replace(/\s+/g, ' '));
    }
    return matches;
  });
}

async function checkOverflow(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    let offender = null;
    if (sw > iw) {
      // find widest element
      let maxRight = 0;
      let el = null;
      document.querySelectorAll('body *').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.right > maxRight) {
          maxRight = r.right;
          el = e;
        }
      });
      offender = el ? (el.tagName + (el.className ? '.' + String(el.className).replace(/\s+/g, '.') : '')) : null;
    }
    return { scrollWidth: sw, innerWidth: iw, overflow: sw > iw, offender, offenderRight: maxRight_safe() };
    function maxRight_safe() { return 0; }
  });
}

async function measureTouchTargets(page) {
  return page.evaluate(() => {
    const selectors = 'button, a[href], [role="button"], input, select, [tabindex]';
    const els = Array.from(document.querySelectorAll(selectors));
    const results = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 40);
      let selector = el.tagName.toLowerCase();
      if (el.id) selector += '#' + el.id;
      else if (el.className && typeof el.className === 'string') selector += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
      results.push({
        selector,
        label,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
      });
    }
    return results;
  });
}

async function shot(page, name) {
  const p = path.join(SHOT_DIR, name);
  await page.screenshot({ path: p });
  log('screenshot', name);
  return p;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const report = {
    consoleErrors: {},
    nanFindings: {},
    overflow: {},
    smallTargets: {},
    notes: [],
  };

  const browser = await chromium.launch({ executablePath: EXEC, headless: true });

  // ============ PHASE 1: fresh profile, empty DB, first load ============
  let context = await browser.newContext({ ...S26, permissions: [] });
  let page = await context.newPage();
  const consoleBucket1 = [];
  await collectConsole(page, consoleBucket1);

  log('Navigating to', BASE);
  const resp = await page.goto(BASE, { waitUntil: 'load', timeout: 30000 }).catch(e => { report.notes.push('goto failed: ' + e.message); return null; });
  report.notes.push('initial nav status: ' + (resp ? resp.status() : 'NO RESPONSE'));
  await page.waitForTimeout(1500);
  await shot(page, '00-first-paint.png');
  report.consoleErrors['00-first-paint'] = [...consoleBucket1];

  // Check body text to see if white screen / crashed
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  report.notes.push('Body text snippet after first load: ' + JSON.stringify(bodyText.slice(0, 300)));

  // ============ PHASE 2: First-run PIN setup flow ============
  // Expect LockScreen setup-enter mode
  await shot(page, '01-lockscreen-setup-enter.png');

  async function tapPinDigits(pin) {
    for (const d of pin.split('')) {
      const btn = page.locator(`button[aria-label="${d}"], button:has-text("${d}")`).first();
      // Fallback: keypad buttons might just have text content = digit
      const candidates = await page.locator('button', { hasText: new RegExp(`^${d}$`) }).all();
      if (candidates.length > 0) {
        await candidates[0].tap();
      } else {
        await btn.tap();
      }
      await page.waitForTimeout(80);
    }
  }

  // Inspect keypad buttons to understand markup
  const keypadButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(),
      aria: b.getAttribute('aria-label'),
    }));
  });
  report.notes.push('Keypad buttons on lock screen: ' + JSON.stringify(keypadButtons));

  const PIN = '135790';
  try {
    await tapPinDigits(PIN);
    await page.waitForTimeout(600);
    await shot(page, '02-lockscreen-setup-confirm.png');
    await tapPinDigits(PIN);
    await page.waitForTimeout(800);
    await shot(page, '03-after-pin-confirm.png');
  } catch (e) {
    report.notes.push('PIN SETUP FLOW ERROR: ' + e.message);
    await shot(page, '03-ERROR-pin-setup.png');
  }

  // Check if we're past the lock screen
  const dialogVisible = await page.locator('[role="dialog"][aria-modal="true"]').count();
  report.notes.push('Lock dialog count after setup attempt: ' + dialogVisible);

  await shot(page, '04-post-lock-empty-home.png');

  // ============ PHASE 3: empty-state screenshots across all screens (before demo data) ============
  const routes = [
    { path: '#/', name: '05-empty-home' },
    { path: '#/log', name: '06-empty-log-transactions' },
    { path: '#/trends', name: '07-empty-trends' },
    { path: '#/more', name: '08-empty-more' },
    { path: '#/budgets', name: '09-empty-budgets' },
    { path: '#/import', name: '10-empty-import' },
    { path: '#/settings', name: '11-empty-settings' },
  ];

  for (const r of routes) {
    try {
      await page.goto(BASE + r.path, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(500);
      await shot(page, r.name + '.png');
      const nan = await grepNaN(page);
      if (nan.length) report.nanFindings[r.name] = nan;
      const overflow = await checkOverflow(page);
      report.overflow[r.name] = overflow;
    } catch (e) {
      report.notes.push(`EMPTY route ${r.path} error: ${e.message}`);
    }
  }

  // Also check Log sub-tabs (Recurring, Habits) empty
  try {
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const recurringTab = page.locator('button, [role="tab"]', { hasText: 'Recurring' }).first();
    if (await recurringTab.count()) {
      await recurringTab.tap();
      await page.waitForTimeout(400);
      await shot(page, '12-empty-recurring.png');
      const nan = await grepNaN(page);
      if (nan.length) report.nanFindings['12-empty-recurring'] = nan;
    }
    const habitsTab = page.locator('button, [role="tab"]', { hasText: 'Habits' }).first();
    if (await habitsTab.count()) {
      await habitsTab.tap();
      await page.waitForTimeout(400);
      await shot(page, '13-empty-habits.png');
      const nan = await grepNaN(page);
      if (nan.length) report.nanFindings['13-empty-habits'] = nan;
    }
  } catch (e) {
    report.notes.push('Empty log sub-tabs error: ' + e.message);
  }

  report.consoleErrorsPhase1 = consoleBucket1;

  // ============ PHASE 4: reload and verify re-lock ============
  const consoleBucket2 = [];
  await collectConsole(page, consoleBucket2);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await shot(page, '14-after-reload-relock-check.png');
  const relockDialog = await page.locator('[role="dialog"][aria-modal="true"]').count();
  report.notes.push('Re-lock dialog present after reload: ' + (relockDialog > 0));

  if (relockDialog > 0) {
    // unlock with same PIN
    try {
      await tapPinDigits(PIN);
      await page.waitForTimeout(800);
      await shot(page, '15-after-unlock-with-pin.png');
      const stillLocked = await page.locator('[role="dialog"][aria-modal="true"]').count();
      report.notes.push('Dialog still present after unlock attempt: ' + stillLocked);
    } catch (e) {
      report.notes.push('Unlock attempt error: ' + e.message);
    }
  }

  // ============ PHASE 5: load demo data via Settings ============
  await page.goto(BASE + '#/settings', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  try {
    const demoBtn = page.locator('button', { hasText: 'Load demo data' }).first();
    await demoBtn.waitFor({ state: 'visible', timeout: 5000 });
    await demoBtn.tap();
    await page.waitForTimeout(2000);
    await shot(page, '16-after-load-demo-data.png');
  } catch (e) {
    report.notes.push('Load demo data click error: ' + e.message);
    await shot(page, '16-ERROR-load-demo-data.png');
  }

  // ============ PHASE 6: screenshot every screen WITH demo data ============
  const demoRoutes = [
    { path: '#/', name: '20-demo-home' },
    { path: '#/log', name: '21-demo-log-transactions' },
    { path: '#/trends', name: '22-demo-trends' },
    { path: '#/budgets', name: '23-demo-budgets' },
    { path: '#/import', name: '24-demo-import' },
    { path: '#/settings', name: '25-demo-settings' },
    { path: '#/more', name: '26-demo-more' },
  ];
  for (const r of demoRoutes) {
    try {
      await page.goto(BASE + r.path, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(600);
      await shot(page, r.name + '.png');
      const overflow = await checkOverflow(page);
      report.overflow[r.name] = overflow;
      const nan = await grepNaN(page);
      if (nan.length) report.nanFindings[r.name] = nan;
    } catch (e) {
      report.notes.push(`DEMO route ${r.path} error: ${e.message}`);
    }
  }

  // Log sub-tabs with demo data
  try {
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const recurringTab = page.locator('button, [role="tab"]', { hasText: 'Recurring' }).first();
    if (await recurringTab.count()) {
      await recurringTab.tap();
      await page.waitForTimeout(500);
      await shot(page, '27-demo-recurring.png');
      const nan = await grepNaN(page);
      if (nan.length) report.nanFindings['27-demo-recurring'] = nan;
      report.overflow['27-demo-recurring'] = await checkOverflow(page);
    }
    const habitsTab = page.locator('button, [role="tab"]', { hasText: 'Habits' }).first();
    if (await habitsTab.count()) {
      await habitsTab.tap();
      await page.waitForTimeout(500);
      await shot(page, '28-demo-habits.png');
      const nan = await grepNaN(page);
      if (nan.length) report.nanFindings['28-demo-habits'] = nan;
      report.overflow['28-demo-habits'] = await checkOverflow(page);
    }
  } catch (e) {
    report.notes.push('Demo log sub-tabs error: ' + e.message);
  }

  // ============ PHASE 7: touch target measurement across key screens ============
  const measureRoutes = ['#/', '#/log', '#/trends', '#/budgets', '#/more', '#/settings'];
  for (const r of measureRoutes) {
    try {
      await page.goto(BASE + r, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const targets = await measureTouchTargets(page);
      const small = targets.filter(t => t.w < 48 || t.h < 48);
      report.smallTargets[r] = small;
    } catch (e) {
      report.notes.push(`Measure targets ${r} error: ${e.message}`);
    }
  }

  // ============ PHASE 8: quick-add tap-count timing test ============
  await page.goto(BASE + '#/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  let tapCount = 0;
  const startTime = Date.now();
  try {
    // Tap FAB (center plus) - navigates to /log
    const fab = page.locator('a[aria-label="Quick add"]').first();
    await fab.tap(); tapCount++;
    await page.waitForTimeout(300);
    await shot(page, '30-quickadd-category-grid.png');

    // Pick first category tile
    const catTile = page.locator('button, [role="button"]').filter({ hasText: /.+/ }).first();
    // Better: find category grid tiles specifically
    const tiles = await page.locator('[class*="grid"] button, button:has(svg)').all();
    report.notes.push('Quick-add candidate tile count: ' + tiles.length);
    // Use a more targeted approach: category tiles are buttons inside CategoryGrid
    const anyCategoryBtn = page.locator('button').filter({ hasNotText: /^(Change category|Note, date, account|Save|Enter an amount)$/ });
    const firstCat = anyCategoryBtn.first();
    await firstCat.tap(); tapCount++;
    await page.waitForTimeout(300);
    await shot(page, '31-quickadd-keypad.png');

    // Enter amount: tap digits 5, 0, 0 -> $5.00 (buffer is cents-based typically)
    for (const d of ['5', '0', '0']) {
      const digitBtn = page.locator('button', { hasText: new RegExp(`^${d}$`) }).first();
      await digitBtn.tap(); tapCount++;
      await page.waitForTimeout(100);
    }
    await shot(page, '32-quickadd-amount-entered.png');

    // Tap Save
    const saveBtn = page.locator('button', { hasText: /^Save/ }).first();
    await saveBtn.tap(); tapCount++;
    const elapsed = Date.now() - startTime;
    await page.waitForTimeout(500);
    await shot(page, '33-quickadd-after-save.png');
    report.quickAdd = { tapCount, elapsedMs: elapsed };

    // Verify transaction appears in list
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await shot(page, '34-quickadd-verify-in-list.png');
    const listText = await page.evaluate(() => document.body.innerText);
    report.quickAdd.savedAmountVisible = listText.includes('5.00') || listText.includes('$5.00');
  } catch (e) {
    report.notes.push('Quick-add flow error: ' + e.message);
    report.quickAdd = { error: e.message, tapCount };
    await shot(page, '3X-ERROR-quickadd.png');
  }

  await context.close();

  // ============ PHASE 9: PWA manifest + icons check ============
  const manifestResp = await fetch(BASE + 'manifest.webmanifest').catch(() => null);
  let manifestJson = null;
  if (manifestResp && manifestResp.ok) {
    manifestJson = await manifestResp.json();
  }
  report.manifest = manifestJson;

  const iconChecks = {};
  if (manifestJson) {
    for (const icon of manifestJson.icons || []) {
      const url = new URL(icon.src, BASE).toString();
      try {
        const r = await fetch(url);
        iconChecks[icon.src] = { status: r.status, contentType: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength };
      } catch (e) {
        iconChecks[icon.src] = { error: e.message };
      }
    }
  }
  report.iconChecks = iconChecks;

  // ============ PHASE 10: Service worker + offline test ============
  context = await browser.newContext({ ...S26 });
  page = await context.newPage();
  const swBucket = [];
  await collectConsole(page, swBucket);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      // wait a bit for registration
      await new Promise(r => setTimeout(r, 1500));
    }
    const reg2 = await navigator.serviceWorker.getRegistration();
    return {
      supported: true,
      registered: !!reg2,
      scope: reg2 ? reg2.scope : null,
      active: reg2 && reg2.active ? reg2.active.state : null,
    };
  });
  report.serviceWorker = swState;

  // Redo PIN setup for this fresh context so we can navigate app while offline
  const kp = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
  report.notes.push('SW-context keypad buttons: ' + JSON.stringify(kp).slice(0, 500));
  try {
    await tapPinDigits(PIN);
    await page.waitForTimeout(500);
    await tapPinDigits(PIN);
    await page.waitForTimeout(800);
  } catch (e) {
    report.notes.push('SW-context pin setup error: ' + e.message);
  }
  await shot(page, '40-online-before-offline-test.png');

  // wait for SW to finish precaching
  await page.waitForTimeout(2000);

  await context.setOffline(true);
  report.notes.push('Context set offline');
  const offlineErrors = [];
  page.on('pageerror', e => offlineErrors.push(e.message));
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);
    await shot(page, '41-offline-after-reload.png');
    const offlineBodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    report.offlineTest = { reloadSucceeded: true, bodyTextSnippet: offlineBodyText };

    // Try navigating within app while offline
    await page.goto(BASE + '#/log', { waitUntil: 'load', timeout: 10000 }).catch(e => { report.notes.push('offline nav to #/log failed: ' + e.message); });
    await page.waitForTimeout(800);
    await shot(page, '42-offline-navigate-log.png');
  } catch (e) {
    report.offlineTest = { reloadSucceeded: false, error: e.message };
    await shot(page, '41-ERROR-offline-reload.png');
  }
  report.offlineConsoleErrors = swBucket;
  await context.setOffline(false);
  await context.close();

  await browser.close();

  fs.writeFileSync('/tmp/qa-report.json', JSON.stringify(report, null, 2));
  log('DONE. Report written to /tmp/qa-report.json');
})().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
