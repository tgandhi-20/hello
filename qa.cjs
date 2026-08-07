const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOT_DIR = '/home/user/hello/qa-screenshots';
const BASE = 'http://localhost:4173/hello/';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PIN = '135790';

const S26 = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 3.5,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

const report = { notes: [], nanFindings: {}, overflow: {}, smallTargets: {} };

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function newBrowser() {
  return chromium.launch({ executablePath: EXEC, headless: true });
}

async function killBrowser(browser) {
  try {
    const proc = browser.process();
    if (proc) proc.kill('SIGKILL');
  } catch (e) { /* ignore */ }
  try { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 1000))]); } catch (e) { /* ignore */ }
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('TIMEOUT:' + label)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function collectConsole(page, bucket) {
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') bucket.push(`[console.${msg.type()}] ${msg.text()}`); });
  page.on('pageerror', (err) => bucket.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => bucket.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`));
  page.on('response', (res) => { if (res.status() >= 400) bucket.push(`[http${res.status()}] ${res.url()}`); });
}

async function grepNaN(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const matches = [];
    const re = /(NaN|Infinity|-Infinity|undefined|null)\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push(text.slice(Math.max(0, m.index - 25), m.index + 25).replace(/\s+/g, ' '));
    }
    return matches;
  });
}

async function checkOverflow(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    let offender = null, maxRight = 0;
    if (sw > iw) {
      document.querySelectorAll('body *').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.right > maxRight) { maxRight = r.right; offender = e.tagName + (e.className ? '.' + String(e.className).replace(/\s+/g, '.') : ''); }
      });
    }
    return { scrollWidth: sw, innerWidth: iw, overflow: sw > iw, offender, offenderRight: maxRight };
  });
}

async function measureTouchTargets(page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, a[href], [role="button"], input, select, [tabindex]'));
    const out = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 40);
      let selector = el.tagName.toLowerCase();
      if (el.id) selector += '#' + el.id;
      else if (el.className && typeof el.className === 'string') selector += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
      out.push({ selector, label, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 });
    }
    return out;
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
  log('screenshot', name);
}

async function tapPinDigits(page, pin) {
  for (const d of pin.split('')) {
    const btn = page.locator('button', { hasText: new RegExp(`^${d}$`) }).first();
    await btn.tap();
    await page.waitForTimeout(80);
  }
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ================= PHASE 1: fresh load, first paint, PIN setup, empty states =================
  let browser = await newBrowser();
  let context = await browser.newContext({ ...S26 });
  let page = await context.newPage();
  const c1 = []; await collectConsole(page, c1);

  let resp;
  try {
    resp = await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  } catch (e) { report.notes.push('INITIAL GOTO FAILED: ' + e.message); }
  report.notes.push('initial nav status: ' + (resp ? resp.status() : 'NO RESPONSE'));
  await page.waitForTimeout(1200);
  await shot(page, '00-first-paint.png');
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => 'EVAL FAILED');
  report.notes.push('Body text snippet: ' + JSON.stringify(bodyText));
  report.consoleFirstPaint = [...c1];

  await shot(page, '01-lockscreen-setup-enter.png');
  try {
    await tapPinDigits(page, PIN);
    await page.waitForTimeout(500);
    await shot(page, '02-lockscreen-setup-confirm.png');
    await tapPinDigits(page, PIN);
    await page.waitForTimeout(800);
    await shot(page, '03-after-pin-confirm.png');
  } catch (e) { report.notes.push('PIN SETUP ERROR: ' + e.message); }

  const dialogCount = await page.locator('[role="dialog"][aria-modal="true"]').count().catch(() => -1);
  report.notes.push('Lock dialog count after setup: ' + dialogCount);
  await shot(page, '04-post-lock-empty-home.png');

  const emptyRoutes = [
    ['#/', '05-empty-home'],
    ['#/log', '06-empty-log-transactions'],
    ['#/trends', '07-empty-trends'],
    ['#/more', '08-empty-more'],
    ['#/budgets', '09-empty-budgets'],
    ['#/import', '10-empty-import'],
    ['#/settings', '11-empty-settings'],
  ];
  for (const [r, name] of emptyRoutes) {
    try {
      await page.goto(BASE + r, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(500);
      await shot(page, name + '.png');
      const nan = await grepNaN(page); if (nan.length) report.nanFindings[name] = nan;
      report.overflow[name] = await checkOverflow(page);
    } catch (e) { report.notes.push(`EMPTY ${r} error: ${e.message}`); }
  }

  // Empty Recurring tab (known safe based on isolated testing)
  try {
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const recurringTab = page.locator('button, [role="tab"]', { hasText: 'Recurring' }).first();
    await withTimeout(recurringTab.click({ timeout: 6000 }), 8000, 'recurring-click');
    await page.waitForTimeout(400);
    await shot(page, '12-empty-recurring.png');
    const nan = await grepNaN(page); if (nan.length) report.nanFindings['12-empty-recurring'] = nan;
  } catch (e) { report.notes.push('Empty Recurring tab error: ' + e.message); }

  // ---- KNOWN HAZARD: Habits tab with ZERO txns triggers an infinite loop in
  // computeHabitStats -> streakEndingAt (earliestDate === null makes the while-loop
  // condition `!earliestDate || ...` permanently true). Confirmed via isolated repro:
  // clicking the Habits tab on an empty DB hangs Playwright's click forever and the
  // renderer becomes unresponsive / the browser process has to be SIGKILLed. We
  // attempt it here with a hard timeout + forced process kill so the rest of the
  // audit can continue, and record it as a P0 finding.
  try {
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const habitsTab = page.locator('button, [role="tab"]', { hasText: 'Habits' }).first();
    await withTimeout(habitsTab.click({ timeout: 6000 }), 7000, 'habits-click');
    await page.waitForTimeout(400);
    await shot(page, '13-empty-habits.png');
    report.notes.push('UNEXPECTED: Habits tab click on empty DB did NOT hang this time.');
  } catch (e) {
    report.notes.push('P0 CONFIRMED: Habits tab click on EMPTY database hangs/freezes the app. Error: ' + e.message);
    report.habitsEmptyStateFreeze = true;
    await killBrowser(browser);
    // fresh browser + context for the rest of phase 1 continuation
    browser = await newBrowser();
    context = await browser.newContext({ ...S26 });
    page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);
    // re-setup pin since this is a brand new profile again
    try {
      await tapPinDigits(page, PIN);
      await page.waitForTimeout(500);
      await tapPinDigits(page, PIN);
      await page.waitForTimeout(800);
    } catch (e2) { report.notes.push('Re-setup PIN after habits-crash-recovery error: ' + e2.message); }
  }

  // ================= PHASE 2: reload -> verify re-lock -> unlock =================
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1000);
    await shot(page, '14-after-reload-relock-check.png');
    const relockDialog = await page.locator('[role="dialog"][aria-modal="true"]').count();
    report.notes.push('Re-lock dialog present after reload: ' + (relockDialog > 0));
    if (relockDialog > 0) {
      await tapPinDigits(page, PIN);
      await page.waitForTimeout(800);
      await shot(page, '15-after-unlock-with-pin.png');
      const stillLocked = await page.locator('[role="dialog"][aria-modal="true"]').count();
      report.notes.push('Dialog still present after unlock attempt: ' + stillLocked);
    }
  } catch (e) { report.notes.push('Reload/relock phase error: ' + e.message); }

  // ================= PHASE 3: load demo data =================
  try {
    await page.goto(BASE + '#/settings', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const demoBtn = page.locator('button', { hasText: 'Load demo data' }).first();
    await demoBtn.waitFor({ state: 'visible', timeout: 5000 });
    await demoBtn.tap();
    await page.waitForTimeout(2000);
    await shot(page, '16-after-load-demo-data.png');
  } catch (e) {
    report.notes.push('Load demo data error: ' + e.message);
    await shot(page, '16-ERROR-load-demo-data.png');
  }

  // ================= PHASE 4: screenshot every screen WITH demo data =================
  const demoRoutes = [
    ['#/', '20-demo-home'],
    ['#/log', '21-demo-log-transactions'],
    ['#/trends', '22-demo-trends'],
    ['#/budgets', '23-demo-budgets'],
    ['#/import', '24-demo-import'],
    ['#/settings', '25-demo-settings'],
    ['#/more', '26-demo-more'],
  ];
  for (const [r, name] of demoRoutes) {
    try {
      await page.goto(BASE + r, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(600);
      await shot(page, name + '.png');
      report.overflow[name] = await checkOverflow(page);
      const nan = await grepNaN(page); if (nan.length) report.nanFindings[name] = nan;
    } catch (e) { report.notes.push(`DEMO ${r} error: ${e.message}`); }
  }

  // Demo Recurring + Habits (now with data — earliestDate should be non-null so
  // the Habits infinite loop should NOT trigger; this validates the root-cause theory)
  try {
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const recurringTab = page.locator('button, [role="tab"]', { hasText: 'Recurring' }).first();
    await recurringTab.click({ timeout: 6000 });
    await page.waitForTimeout(500);
    await shot(page, '27-demo-recurring.png');
    report.overflow['27-demo-recurring'] = await checkOverflow(page);
    const nan1 = await grepNaN(page); if (nan1.length) report.nanFindings['27-demo-recurring'] = nan1;
  } catch (e) { report.notes.push('Demo Recurring tab error: ' + e.message); }

  try {
    const habitsTab = page.locator('button, [role="tab"]', { hasText: 'Habits' }).first();
    await withTimeout(habitsTab.click({ timeout: 8000 }), 9000, 'demo-habits-click');
    await page.waitForTimeout(500);
    await shot(page, '28-demo-habits.png');
    report.overflow['28-demo-habits'] = await checkOverflow(page);
    const nan2 = await grepNaN(page); if (nan2.length) report.nanFindings['28-demo-habits'] = nan2;
    report.habitsWorksWithDemoData = true;
  } catch (e) {
    report.notes.push('Demo Habits tab error (unexpected if root cause theory correct): ' + e.message);
    report.habitsWorksWithDemoData = false;
    await killBrowser(browser);
    browser = await newBrowser();
    context = await browser.newContext({ ...S26 });
    page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(500);
    try {
      const dlg = await page.locator('[role="dialog"][aria-modal="true"]').count();
      if (dlg > 0) { await tapPinDigits(page, PIN); await page.waitForTimeout(600); }
    } catch (e2) { /* ignore */ }
  }

  // ================= PHASE 5: touch target measurement (with demo data loaded) =================
  const measureRoutes = ['#/', '#/log', '#/trends', '#/budgets', '#/more', '#/settings'];
  for (const r of measureRoutes) {
    try {
      await page.goto(BASE + r, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(400);
      const targets = await measureTouchTargets(page);
      report.smallTargets[r] = targets.filter((t) => t.w < 48 || t.h < 48);
    } catch (e) { report.notes.push(`Measure targets ${r} error: ${e.message}`); }
  }
  // also measure category grid tiles + keypad on quick add screen
  try {
    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const targets = await measureTouchTargets(page);
    report.smallTargets['#/log(add-tab-categorygrid)'] = targets.filter((t) => t.w < 48 || t.h < 48);
  } catch (e) { report.notes.push('Measure quickadd targets error: ' + e.message); }

  // ================= PHASE 6: quick-add tap-count + timing test =================
  try {
    await page.goto(BASE + '#/', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    let tapCount = 0;
    const t0 = Date.now();
    const fab = page.locator('a[aria-label="Quick add"]').first();
    await fab.tap(); tapCount++;
    await page.waitForTimeout(250);
    await shot(page, '30-quickadd-category-grid.png');

    const catButtons = page.locator('[role="group"][aria-label="Categories"] button');
    const firstCat = catButtons.first();
    await firstCat.tap(); tapCount++;
    await page.waitForTimeout(250);
    await shot(page, '31-quickadd-keypad.png');

    for (const d of ['5', '0', '0']) {
      const digitBtn = page.locator('button', { hasText: new RegExp(`^${d}$`) }).first();
      await digitBtn.tap(); tapCount++;
      await page.waitForTimeout(90);
    }
    await shot(page, '32-quickadd-amount-entered.png');

    const saveBtn = page.locator('button', { hasText: /^Save/ }).first();
    await saveBtn.tap(); tapCount++;
    const elapsed = Date.now() - t0;
    await page.waitForTimeout(500);
    await shot(page, '33-quickadd-after-save.png');
    report.quickAdd = { tapCount, elapsedMs: elapsed };

    await page.goto(BASE + '#/log', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await shot(page, '34-quickadd-verify-in-list.png');
    const listText = await page.evaluate(() => document.body.innerText);
    report.quickAdd.savedAmountVisible = listText.includes('5.00');
  } catch (e) {
    report.notes.push('Quick-add flow error: ' + e.message);
    await shot(page, '35-ERROR-quickadd.png').catch(() => {});
  }

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  // ================= PHASE 7: manifest + icon checks (plain fetch, no browser needed) =================
  try {
    const manifestResp = await fetch(BASE + 'manifest.webmanifest');
    report.manifest = manifestResp.ok ? await manifestResp.json() : { error: 'HTTP ' + manifestResp.status };
  } catch (e) { report.manifest = { error: e.message }; }

  report.iconChecks = {};
  if (report.manifest && report.manifest.icons) {
    for (const icon of report.manifest.icons) {
      const url = new URL(icon.src, BASE).toString();
      try {
        const r = await fetch(url);
        const buf = await r.arrayBuffer();
        report.iconChecks[icon.src] = { status: r.status, contentType: r.headers.get('content-type'), byteLength: buf.byteLength };
      } catch (e) { report.iconChecks[icon.src] = { error: e.message }; }
    }
  }

  // ================= PHASE 8: service worker registration + offline test =================
  browser = await newBrowser();
  context = await browser.newContext({ ...S26 });
  page = await context.newPage();
  const swBucket = []; await collectConsole(page, swBucket);
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(2000);

    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { await new Promise((r) => setTimeout(r, 1500)); reg = await navigator.serviceWorker.getRegistration(); }
      return { supported: true, registered: !!reg, scope: reg ? reg.scope : null, active: reg && reg.active ? reg.active.state : null };
    });
    report.serviceWorker = swState;

    // check cache storage contents (precache)
    const cacheInfo = await page.evaluate(async () => {
      const names = await caches.keys();
      const out = {};
      for (const n of names) {
        const c = await caches.open(n);
        const keys = await c.keys();
        out[n] = keys.length;
      }
      return { cacheNames: names, entryCounts: out };
    }).catch((e) => ({ error: e.message }));
    report.cacheStorage = cacheInfo;

    // set up PIN for this fresh context
    try {
      const dlg = await page.locator('[role="dialog"][aria-modal="true"]').count();
      if (dlg > 0) {
        await tapPinDigits(page, PIN);
        await page.waitForTimeout(500);
        await tapPinDigits(page, PIN);
        await page.waitForTimeout(800);
      }
    } catch (e) { report.notes.push('SW-context PIN setup error: ' + e.message); }
    await shot(page, '40-online-before-offline-test.png');

    await page.waitForTimeout(1500); // let SW finish precaching

    await context.setOffline(true);
    report.notes.push('Context set offline=true');
    try {
      await page.reload({ waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1200);
      await shot(page, '41-offline-after-reload.png');
      const offlineBodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
      report.offlineTest = { reloadSucceeded: true, bodyTextSnippet: offlineBodyText };

      await page.goto(BASE + '#/log', { waitUntil: 'load', timeout: 10000 }).catch((e) => report.notes.push('offline nav to #/log failed: ' + e.message));
      await page.waitForTimeout(600);
      await shot(page, '42-offline-navigate-log.png');
    } catch (e) {
      report.offlineTest = { reloadSucceeded: false, error: e.message };
      await shot(page, '41-ERROR-offline-reload.png').catch(() => {});
    }
    await context.setOffline(false);
  } catch (e) {
    report.notes.push('SW/offline phase fatal error: ' + e.message);
  }
  report.offlineConsoleErrors = swBucket;

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  fs.writeFileSync('/tmp/qa-report.json', JSON.stringify(report, null, 2));
  log('DONE. Report -> /tmp/qa-report.json');
})().catch((e) => {
  console.error('FATAL TOP LEVEL', e);
  fs.writeFileSync('/tmp/qa-report.json', JSON.stringify(report, null, 2));
  process.exit(1);
});
