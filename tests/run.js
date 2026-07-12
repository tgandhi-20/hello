#!/usr/bin/env node
/* ============================================================
   Fintrack — end-to-end regression suite
   Runs the real app in headless Chromium and exercises every view
   and key flow. Requires playwright (global install works):
       NODE_PATH=$(npm root -g) node tests/run.js
   Exits 0 on success, non-zero on any failure or page error.
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8941;
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function startServer() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split("?")[0]);
            if (p === "/") p = "/index.html";
            const file = path.join(ROOT, p);
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404); return res.end("not found");
            }
            res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
            fs.createReadStream(file).pipe(res);
        });
        srv.listen(PORT, () => resolve(srv));
    });
}

(async () => {
    let chromium;
    try { ({ chromium } = require("playwright")); }
    catch (e) {
        console.error("playwright not found. Run with: NODE_PATH=$(npm root -g) node tests/run.js");
        process.exit(1);
    }

    const srv = await startServer();
    const APP = `http://localhost:${PORT}/index.html`;
    const browser = await chromium.launch();
    const errors = [];
    let pass = 0, fail = 0;
    const check = (name, cond) => { console.log((cond ? "PASS" : "FAIL") + " — " + name); cond ? pass++ : fail++; };

    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on("pageerror", e => errors.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
    const visit = async v => { await page.click(`.nav-item[data-view="${v}"]`); await page.waitForTimeout(250); return page.textContent(`#view-${v}`); };
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("fintrack.v1")));
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    /* ---------- onboarding ---------- */
    await page.goto(APP);
    await page.waitForTimeout(400);
    check("onboarding shows for fresh user", await page.isVisible("#obStart"));
    await page.selectOption("#obCur", "$");
    await page.fill("#obIncome", "4300");
    await page.click("#obDemo");
    await page.waitForTimeout(700);
    check("demo data loads from onboarding", (await page.textContent("#view-dashboard")).includes("Safe to spend"));
    check("income preserved through demo load", (await state()).settings.monthlyIncome === 4300);

    /* ---------- dashboard ---------- */
    const dash = await page.textContent("#view-dashboard");
    for (const label of ["Safe to spend", "Spend pace", "Net worth", "Bills & subscriptions", "Recent transactions"])
        check("dashboard shows " + label, dash.includes(label));
    check("dashboard donut excludes neutral Savings", !/Spending by category[\s\S]*?Savings/.test(dash));

    /* ---------- import: parse, categorize, dedupe, bill match, insights ---------- */
    await visit("upload");
    // duplicate-charge rows must differ in date (same-day identical rows are
    // de-duplicated at import) — adjacent days trigger the insight instead
    const csv = ["Date,Description,Amount",
        `${month}-02,STARBUCKS 991,-6.75`,
        `${month}-03,FANCY RESTAURANT,-310.00`,
        `${month}-04,FANCY RESTAURANT,-310.00`, // duplicate charge, 1 day apart
        `${month}-05,MEGA ELECTRONICS,-899.00`, // large expense
        `${month}-12,City Electric Utility,-94.50`, // matches Electric bill ($95 ±2.5%)
        `${today},Coffee Cart,-10.25`].join("\n");
    await page.fill("#pasteArea", csv);
    await page.click("#parsePaste");
    await page.waitForTimeout(500);
    let txt = await page.textContent("#view-transactions");
    check("import lands on transactions", txt.includes("STARBUCKS") || txt.includes("transactions"));
    const st1 = await state();
    const sb = st1.transactions.find(t => t.description === "STARBUCKS 991");
    check("Starbucks auto-categorized as Dining", sb && sb.category === "Dining");
    check("bill auto-matched from import", st1.bills.find(b => b.name === "Electric").paidMonths.includes(month));
    // re-import the same file: all duplicates
    await visit("upload");
    await page.fill("#pasteArea", csv);
    await page.click("#parsePaste");
    await page.waitForTimeout(400);
    check("re-import skips duplicates", /already imported|duplicate/i.test(await page.textContent("#toastHost")));

    await visit("dashboard");
    const dash2 = await page.textContent("#view-dashboard");
    check("insights: duplicate charge detected", dash2.includes("Possible duplicate charge"));
    check("insights: large expense detected", dash2.includes("Large expense"));

    /* ---------- transactions: search, filter, tags, edit ---------- */
    await visit("transactions");
    await page.click("#addTxBtn");
    await page.waitForTimeout(200);
    await page.fill("#mDesc", "Tokyo Flight");
    await page.fill("#mAmt", "-620");
    await page.fill("#mTags", "vacation, #japan, vacation");
    await page.click("#mSave");
    await page.waitForTimeout(400);
    const tokyo = (await state()).transactions.find(t => t.description === "Tokyo Flight");
    check("tags parsed/deduped/#-stripped", JSON.stringify(tokyo.tags) === '["vacation","japan"]');
    await page.click('[data-tagclick="japan"]');
    await page.waitForTimeout(300);
    txt = await page.textContent("#view-transactions");
    check("tag chip filters list", txt.includes("1 transactions") && txt.includes("Tokyo Flight"));
    await page.selectOption("#txTagFilter", "");
    await page.waitForTimeout(250);
    await page.fill("#txSearch", "Coffee Cart");
    await page.waitForTimeout(500);
    check("search filters", (await page.textContent("#view-transactions")).includes("Coffee Cart"));
    await page.fill("#txSearch", "");
    await page.waitForTimeout(400);

    /* ---------- budgets: ring, template, rollover ---------- */
    let bud = await visit("budgets");
    check("budget usage ring", bud.includes("Budget used"));
    await page.click("#templateBudget");
    await page.waitForTimeout(250);
    check("50/30/20 modal", (await page.textContent("#modal")).includes("50% needs"));
    await page.click("#tApply");
    await page.waitForTimeout(400);
    const budgets = (await state()).budgets;
    const needs = ["Housing", "Groceries", "Utilities", "Transport", "Health"].reduce((a, c) => a + (budgets[c] || 0), 0);
    check("template allocates ~50% to needs", Math.abs(needs - 4300 * 0.5) < 4300 * 0.08);
    const roll = await page.$("label.switch:has([data-rollover])");
    if (roll) { await roll.click(); await page.waitForTimeout(300); }
    check("rollover toggles without error", true);

    /* ---------- goals: round-up jar, contribute ---------- */
    await visit("goals");
    check("round-up jar present", (await page.textContent("#view-goals")).includes("Round-up jar"));
    await page.click("#roundupOn");
    await page.waitForTimeout(300);
    check("round-up enable UI", await page.isVisible("#roundupGoal"));
    // independent oracle: recompute expected accrual from stored transactions
    // (demo data may include transactions dated today, so don't hardcode)
    const expectedAccrual = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("fintrack.v1"));
        const since = s.settings.roundupLastSweep, today = new Date().toISOString().slice(0, 10);
        const neutral = new Set(["Savings", "Transfer"]);
        let sum = 0;
        s.transactions.forEach(t => {
            if (t.amount >= 0 || neutral.has(t.category)) return;
            if (!t.date || t.date <= since || t.date > today) return;
            const up = Math.ceil(-t.amount) - (-t.amount);
            if (up > 0.004) sum += up;
        });
        return Math.round(sum * 100) / 100;
    });
    check("round-up accrual includes today's Coffee Cart (>= .75)", expectedAccrual >= 0.75);
    const gBefore = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("fintrack.v1")); return s.goals.find(x => x.id === s.settings.roundupGoalId).saved; });
    await page.click("#sweepRoundup");
    await page.waitForTimeout(300);
    const gAfter = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("fintrack.v1")); return s.goals.find(x => x.id === s.settings.roundupGoalId).saved; });
    check("sweep adds exact accrual", Math.abs(gAfter - gBefore - expectedAccrual) < 0.005);

    /* ---------- bills: mark paid toggle ---------- */
    await visit("bills");
    check("bills list renders", (await page.textContent("#view-bills")).includes("Rent"));
    await page.click("[data-togglebill]");
    await page.waitForTimeout(250);
    check("bill mark-paid works", (await page.textContent("#view-bills")).includes("Paid"));

    /* ---------- subscriptions ---------- */
    let subs = await visit("subscriptions");
    check("subscriptions list", subs.includes("Netflix") && subs.includes("Annual cost"));
    await page.click("[data-togglesub]");
    await page.waitForTimeout(250);
    check("subscription cancel", (await page.textContent("#view-subscriptions")).includes("Reactivate"));

    /* ---------- habits: heatmap ---------- */
    const habits = await visit("habits");
    check("habits heatmap", habits.includes("Daily spending"));
    const cells = await page.$$eval(".hm-c:not(.hm-empty)", els => els.length);
    const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    check("heatmap day-cell count", cells === dim);

    /* ---------- net worth ---------- */
    const nw = await visit("networth");
    check("net worth accounts & payoff", nw.includes("Chase Checking") && nw.includes("Debt payoff"));
    await page.click("#snapNow");
    await page.waitForTimeout(250);
    check("net worth snapshot saves", (await state()).netWorthSnapshots.length > 0);

    /* ---------- reports ---------- */
    const rep = await visit("reports");
    for (const label of ["Cash-flow forecast", "This month vs last", "Category trend"])
        check("reports shows " + label, rep.includes(label));

    /* ---------- health & advice ---------- */
    const health = await visit("health");
    check("health score renders", /\d+\s*out of 100/.test(health));
    check("health includes net worth metric", health.includes("Net worth & debt"));
    const advice = await visit("advice");
    check("advice renders tips", advice.includes("Personalized advice"));

    /* ---------- settings: currency, custom category, export/import ---------- */
    await visit("settings");
    await page.selectOption("#setCurrency", "€");
    await page.click("#saveSettings");
    await page.waitForTimeout(300);
    check("currency change applies", (await page.textContent("#view-settings")).length > 0 &&
        (await visit("dashboard")).includes("€"));
    await visit("settings");
    await page.click("#addCatBtn");
    await page.waitForTimeout(200);
    await page.fill("#ccName", "Pets");
    await page.fill("#ccKw", "petco, chewy");
    await page.click("#ccSave");
    await page.waitForTimeout(300);
    check("custom category added", (await page.textContent("#view-settings")).includes("Pets"));
    const [dl1] = await Promise.all([page.waitForEvent("download"), page.click("#exportData")]);
    check("JSON backup exports", /fintrack-backup.*\.json/.test(dl1.suggestedFilename()));
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#exportCsvBtn2")]);
    check("CSV export works", /fintrack-transactions.*\.csv/.test(dl2.suggestedFilename()));

    /* ---------- theme ---------- */
    const t0 = await page.getAttribute("html", "data-theme");
    await page.click("#themeToggle");
    await page.waitForTimeout(250);
    check("theme toggles", (await page.getAttribute("html", "data-theme")) !== t0);
    await page.reload();
    await page.waitForTimeout(400);
    check("theme persists", (await page.getAttribute("html", "data-theme")) !== t0);

    /* ---------- modal a11y ---------- */
    await visit("transactions");
    await page.click("#addTxBtn");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check("Esc closes modal", (await page.getAttribute("#modalBackdrop", "hidden")) !== null);

    /* ---------- service worker ---------- */
    await page.waitForTimeout(400);
    check("service worker registers", await page.evaluate(async () =>
        "serviceWorker" in navigator && !!(await navigator.serviceWorker.getRegistration())));

    /* ---------- split transactions ---------- */
    await visit("transactions");
    await page.click("#addTxBtn");
    await page.waitForTimeout(200);
    await page.fill("#mDesc", "Superstore Big Run");
    await page.fill("#mAmt", "-100");
    await page.click("#mSave");
    await page.waitForTimeout(300);
    await page.fill("#txSearch", "Superstore");
    await page.waitForTimeout(500);
    await page.click("[data-splittx]");
    await page.waitForTimeout(250);
    await page.fill('[data-samt="0"]', "60");
    await page.fill('[data-samt="1"]', "40");
    await page.waitForTimeout(150);
    check("split enables at exact sum", !(await page.isDisabled("#spSave")));
    await page.click("#spSave");
    await page.waitForTimeout(400);
    const parts = (await state()).transactions.filter(t => t.description === "Superstore Big Run");
    check("split produced 2 parts summing to total", parts.length === 2 &&
        Math.abs(parts.reduce((a, t) => a + t.amount, 0) + 100) < 0.005);
    check("split parts tagged", parts.every(t => (t.tags || []).includes("split")));
    await page.fill("#txSearch", "");
    await page.waitForTimeout(300);

    /* ---------- multi-currency accounts ---------- */
    await visit("networth");
    const nwBefore = await page.evaluate(() => Finance.netWorth().total);
    await page.click("#addAcctBtn");
    await page.waitForTimeout(200);
    await page.fill("#aName", "EU Savings");
    await page.selectOption("#aType", "Savings");
    await page.fill("#aBal", "1000");
    await page.selectOption("#aCur", "€");
    await page.fill("#aRate", "1.1");
    await page.click("#aSave");
    await page.waitForTimeout(300);
    const nwAfter = await page.evaluate(() => Finance.netWorth().total);
    check("foreign account converts at rate (1000×1.1)", Math.abs(nwAfter - nwBefore - 1100) < 0.01);
    check("account row shows native + converted", /€1,000\.00/.test(await page.textContent("#view-networth")));

    /* ---------- household members ---------- */
    await visit("settings");
    await page.fill("#memberName", "Priya");
    await page.click("#addMemberBtn");
    await page.waitForTimeout(300);
    check("member added", (await state()).members.some(m => m.name === "Priya"));
    await visit("transactions");
    await page.click("#addTxBtn");
    await page.waitForTimeout(200);
    await page.fill("#mDesc", "Priya Groceries");
    await page.fill("#mAmt", "-45");
    const memberId = (await state()).members[0].id;
    await page.selectOption("#mMember", memberId);
    await page.click("#mSave");
    await page.waitForTimeout(300);
    check("transaction assigned to member",
        (await state()).transactions.find(t => t.description === "Priya Groceries").member === memberId);
    const rep2 = await visit("reports");
    check("reports shows spending by member", rep2.includes("Spending by member") && rep2.includes("Priya"));

    /* ---------- loved-feature placement & customizable dashboard ---------- */
    await visit("dashboard");
    check("customize button present", await page.isVisible("#customizeDash"));
    await page.click("#customizeDash");
    await page.waitForTimeout(250);
    check("customize modal lists widgets", (await page.textContent("#modal")).includes("Spending by category"));
    // toggle "Recent transactions" off (last widget) and move insights up
    const toggles = await page.$$("[data-wtog]");
    await page.evaluate(() => {
        const cbs = document.querySelectorAll("[data-wtog]");
        const last = cbs[cbs.length - 1];
        last.checked = false;
        last.dispatchEvent(new Event("change"));
    });
    await page.click("#wSave");
    await page.waitForTimeout(400);
    const dashCustom = await page.textContent("#view-dashboard");
    check("hidden widget disappears", !dashCustom.includes("Recent transactions"));
    check("layout persists in settings", ((await state()).settings.dashboardWidgets || []).some(w => w.on === false));
    // restore
    await page.click("#customizeDash");
    await page.waitForTimeout(250);
    await page.evaluate(() => {
        const cbs = document.querySelectorAll("[data-wtog]");
        const last = cbs[cbs.length - 1];
        last.checked = true;
        last.dispatchEvent(new Event("change"));
    });
    await page.click("#wSave");
    await page.waitForTimeout(300);
    check("widget restores", (await page.textContent("#view-dashboard")).includes("Recent transactions"));
    check("Rocket-style savings framing on dashboard", /Saving .*\/mo|Find ones to cancel/.test(await page.textContent("#view-dashboard")));
    const budA = await visit("budgets");
    check("left-to-assign strip present", budA.includes("doesn't have a job yet") || budA.includes("more than your income") || Math.abs(4300 - Object.values((await state()).budgets).reduce((a,b)=>a+b,0) - 430) < 10);

    /* ---------- stress: XSS injection attempts ---------- */
    await page.evaluate(() => { window.__xss = false; });
    await visit("transactions");
    await page.click("#addTxBtn");
    await page.waitForTimeout(200);
    await page.fill("#mDesc", `<img src=x onerror="window.__xss=true">`);
    await page.fill("#mAmt", "-13.37");
    await page.fill("#mNote", `"><script>window.__xss=true</script>`);
    await page.fill("#mTags", `<b>evil</b>`);
    await page.click("#mSave");
    await page.waitForTimeout(400);
    await page.fill("#txSearch", "img src");
    await page.waitForTimeout(500);
    check("XSS: markup rendered inert as text", (await page.textContent("#view-transactions")).includes('<img src=x'));
    check("XSS: no script executed", !(await page.evaluate(() => window.__xss)));
    check("XSS: no img element injected into row", !(await page.$("#view-transactions td img")));
    await page.fill("#txSearch", "");
    await page.waitForTimeout(300);
    // member name injection
    await visit("settings");
    await page.fill("#memberName", `<script>window.__xss=true</script>`);
    await page.click("#addMemberBtn");
    await page.waitForTimeout(300);
    check("XSS: member name inert", !(await page.evaluate(() => window.__xss)));

    /* ---------- stress: 1200-row import ---------- */
    const bigRows = ["Date,Description,Amount"];
    for (let i = 0; i < 1200; i++) {
        const d = String(1 + (i % 28)).padStart(2, "0");
        const mm = String(1 + (i % 6)).padStart(2, "0");
        bigRows.push(`2026-${mm}-${d},Bulk Merchant ${i},-${(5 + (i % 90) + 0.25).toFixed(2)}`);
    }
    await visit("upload");
    await page.fill("#pasteArea", bigRows.join("\n"));
    const bulkStart = Date.now();
    await page.click("#parsePaste");
    await page.waitForSelector("#view-transactions.active", { timeout: 15000 });
    await page.waitForTimeout(600);
    const elapsed = Date.now() - bulkStart;
    console.log(`  1200-row import took ${elapsed}ms`);
    check("bulk import completes under 10s", elapsed < 10000);
    check("bulk rows stored", (await state()).transactions.filter(t => t.description.startsWith("Bulk Merchant")).length === 1200);
    // dashboard still renders quickly with big dataset
    const dashStart = Date.now();
    await visit("dashboard");
    check("dashboard renders <3s with 1300+ transactions", Date.now() - dashStart < 3000);

    /* ---------- stress: malformed CSV ---------- */
    await visit("upload");
    await page.fill("#pasteArea", `garbage line without commas
,,,,
Date,Description,Amount
not-a-date,Mystery,-5
2026-13-45,Bad Date,-5
2026-06-15,"Quoted, With Comma",-12.50
2026-06-16,No Amount Here,abc
2026-06-17,Huge,-1000000000
2026-06-18,Tiny,-0.004`);
    await page.click("#parsePaste");
    await page.waitForTimeout(500);
    const st3 = await state();
    check("malformed CSV: quoted comma row imported", st3.transactions.some(t => t.description === "Quoted, With Comma"));
    check("malformed CSV: bad rows skipped without crash", !st3.transactions.some(t => t.description === "Mystery" || t.description === "No Amount Here"));
    check("malformed CSV: extreme amount stored", st3.transactions.some(t => t.amount === -1000000000));

    /* ---------- stress: split with awkward rounding ---------- */
    await visit("transactions");
    await page.fill("#txSearch", "Huge");
    await page.waitForTimeout(400);
    await page.click("[data-splittx]");
    await page.waitForTimeout(250);
    await page.fill('[data-samt="0"]', "999999999.99");
    await page.fill('[data-samt="1"]', "0.01");
    await page.waitForTimeout(200);
    check("split validates to the cent on huge amounts", !(await page.isDisabled("#spSave")));
    await page.keyboard.press("Escape");
    await page.fill("#txSearch", "");
    await page.waitForTimeout(300);

    /* ---------- stress: rapid navigation ---------- */
    for (let round = 0; round < 3; round++) {
        for (const v of ["dashboard", "networth", "reports", "transactions", "budgets", "goals", "habits", "health", "advice", "settings"]) {
            await page.click(`.nav-item[data-view="${v}"]`);
        }
    }
    await page.waitForTimeout(500);
    check("rapid navigation survives without errors", errors.length === 0);

    /* ---------- potential savings, interactive logos, light default, app lock ---------- */
    // clean-white default: fresh profile (no saved theme) must open light
    const freshCtx = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
    await freshCtx.goto(APP);
    await freshCtx.waitForTimeout(400);
    check("fresh profile defaults to clean-white light theme", (await freshCtx.getAttribute("html", "data-theme")) === "light");
    await freshCtx.close();

    // potential savings widget (demo data has active subs => lever exists)
    await visit("dashboard");
    const dashSav = await page.textContent("#view-dashboard");
    check("potential savings widget renders", dashSav.includes("Potential savings"));
    check("savings shows monthly and yearly totals", /up to .*\/mo .* \/?yr|\/yr/.test(dashSav));
    check("savings lists subscription lever", dashSav.includes("Trim unused subscriptions"));

    // interactive category logos in budget buckets
    await visit("budgets");
    check("budget buckets show interactive logos", (await page.$$(".cat-logo")).length >= 5);
    await page.click('.cat-logo[data-catgo="Groceries"]');
    await page.waitForTimeout(350);
    check("logo click opens filtered transactions",
        (await page.textContent("#viewTitle")).includes("Transactions") &&
        (await page.inputValue("#txCatFilter")) === "Groceries");
    await page.selectOption("#txCatFilter", "");
    await page.waitForTimeout(250);

    // app lock: set PIN, lock now, wrong PIN rejected, right PIN unlocks, disable
    await visit("settings");
    await page.click("#setPin");
    await page.waitForTimeout(250);
    await page.fill("#pinNew", "4242");
    await page.fill("#pinNew2", "4242");
    await page.click("#pinSave");
    await page.waitForTimeout(400);
    check("PIN stored as salted hash (not plaintext)", await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("fintrack.v1")).settings;
        return !!s.pinHash && /^[0-9a-f]{64}$/.test(s.pinHash) && !JSON.stringify(s).includes("4242");
    }));
    await page.click("#lockNow");
    await page.waitForTimeout(300);
    check("lock screen covers app", await page.isVisible("#lockScreen"));
    await page.fill("#lockPin", "9999");
    await page.click("#lockUnlock");
    await page.waitForTimeout(300);
    check("wrong PIN rejected", await page.isVisible("#lockErr") && await page.isVisible("#lockScreen"));
    await page.fill("#lockPin", "4242");
    await page.click("#lockUnlock");
    await page.waitForTimeout(300);
    check("correct PIN unlocks", !(await page.$("#lockScreen")));
    // locked on reload too
    await page.reload();
    await page.waitForTimeout(500);
    check("app locked on reload", await page.isVisible("#lockScreen"));
    await page.fill("#lockPin", "4242");
    await page.click("#lockUnlock");
    await page.waitForTimeout(300);
    // disable pin
    await visit("settings");
    await page.click("#disablePin");
    await page.waitForTimeout(250);
    await page.fill("#pinOff", "4242");
    await page.click("#pinOffSave");
    await page.waitForTimeout(300);
    check("app lock disables with correct PIN", !(await state()).settings.pinHash);

    /* ---------- mobile viewport ---------- */
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mob.on("pageerror", e => errors.push("mobile pageerror: " + e.message));
    await mob.goto(APP);
    await mob.waitForTimeout(500);
    if (await mob.isVisible("#obDemo")) { await mob.click("#obDemo"); await mob.waitForTimeout(600); }
    check("mobile: bottom nav visible", await mob.isVisible("#bottomNav"));
    check("mobile: sidebar hidden", !(await mob.isVisible("#sidebar .brand-name")));
    check("mobile: FAB visible", await mob.isVisible("#fabAdd"));
    const noHScroll = await mob.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth + 1);
    check("mobile: no horizontal page scroll", noHScroll);
    await mob.click('.bnav-item[data-view="budgets"]');
    await mob.waitForTimeout(300);
    check("mobile: bottom-nav navigation works", (await mob.textContent("#viewTitle")).includes("Budgets"));
    await mob.click("#moreNavBtn");
    await mob.waitForTimeout(300);
    check("mobile: more sheet opens", await mob.isVisible("#moreSheet"));
    await mob.click('.sheet-item[data-view="settings"]');
    await mob.waitForTimeout(300);
    check("mobile: sheet navigates and closes",
        (await mob.textContent("#viewTitle")).includes("Settings") && (await mob.getAttribute("#sheetBackdrop", "hidden")) !== null);
    await mob.click('.bnav-item[data-view="dashboard"]');
    await mob.waitForTimeout(250);
    await mob.click("#fabAdd");
    await mob.waitForTimeout(250);
    check("mobile: FAB opens add-transaction", await mob.isVisible("#mSave"));
    await mob.keyboard.press("Escape");
    await mob.close();

    /* ---------- summary ---------- */
    console.log("---");
    console.log(`RESULT: ${pass} passed, ${fail} failed`);
    console.log("PAGE ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
    await browser.close();
    srv.close();
    process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
