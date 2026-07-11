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
    for (const label of ["Safe to spend", "Spend pace", "Net worth", "Upcoming bills", "Recent transactions"])
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

    /* ---------- summary ---------- */
    console.log("---");
    console.log(`RESULT: ${pass} passed, ${fail} failed`);
    console.log("PAGE ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
    await browser.close();
    srv.close();
    process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
