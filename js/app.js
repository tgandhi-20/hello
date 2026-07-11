/* ============================================================
   Fintrack — main application controller
   ============================================================ */
(function () {
    "use strict";

    const $ = sel => document.querySelector(sel);
    const $$ = sel => Array.from(document.querySelectorAll(sel));
    const CUR = () => Store.state.settings.currency || "$";

    let currentMonth = null; // "YYYY-MM" or null = all time

    /* ---------- utils ---------- */
    const fmt = n => CUR() + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtSigned = n => (n < 0 ? "-" : "+") + fmt(n);
    const fmtShort = n => CUR() + Math.round(Math.abs(n)).toLocaleString();
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const catChip = name => {
        const color = Categorize.categoryColor(name);
        return `<span class="chip"><span class="dot" style="background:${color}"></span>${esc(name)}</span>`;
    };
    const monthLabel = m => {
        if (!m) return "All time";
        const [y, mo] = m.split("-");
        return new Date(y, mo - 1).toLocaleString(undefined, { month: "long", year: "numeric" });
    };

    function toast(msg, type = "") {
        const host = $("#toastHost");
        const el = document.createElement("div");
        el.className = "toast " + type;
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
    }

    function openModal(html) {
        $("#modal").innerHTML = html;
        $("#modalBackdrop").hidden = false;
    }
    function closeModal() { $("#modalBackdrop").hidden = true; }
    $("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") closeModal(); });

    /* ---------- analytics ---------- */
    function summarize(txs) {
        let income = 0, expense = 0;
        const byCat = {};
        txs.forEach(t => {
            if (t.amount >= 0) income += t.amount;
            else {
                expense += -t.amount;
                byCat[t.category] = (byCat[t.category] || 0) + (-t.amount);
            }
        });
        const net = income - expense;
        const savingsRate = income > 0 ? (net / income) * 100 : 0;
        return { income, expense, net, savingsRate, byCat };
    }

    function catBreakdown(byCat) {
        return Object.entries(byCat)
            .map(([label, value]) => ({ label, value, color: Categorize.categoryColor(label) }))
            .sort((a, b) => b.value - a.value);
    }

    function monthlySeries(n = 6) {
        // last n months present in data (or trailing from latest)
        const all = Store.state.transactions;
        const byMonth = {};
        all.forEach(t => {
            const m = (t.date || "").slice(0, 7);
            if (!m) return;
            if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 };
            if (t.amount >= 0) byMonth[m].income += t.amount;
            else byMonth[m].expense += -t.amount;
        });
        const months = Object.keys(byMonth).sort().slice(-n);
        return months.map(m => ({
            month: m,
            label: new Date(m + "-01").toLocaleString(undefined, { month: "short" }),
            ...byMonth[m]
        }));
    }

    /* ============================================================
       VIEW RENDERERS
       ============================================================ */

    function renderDashboard() {
        const txs = Store.txForMonth(currentMonth);
        const s = summarize(txs);
        const breakdown = catBreakdown(s.byCat);
        const series = monthlySeries(6);
        const goals = Store.state.goals;
        const totalSaved = goals.reduce((a, g) => a + g.saved, 0);
        const totalTarget = goals.reduce((a, g) => a + g.target, 0);

        if (Store.state.transactions.length === 0) {
            return `<div class="empty">
                <div class="big">◧</div>
                <p>No data yet. Import a bank statement or load sample data to get started.</p>
                <button class="btn" data-goto="upload">Import a statement</button>
            </div>`;
        }

        const recent = txs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

        return `
        <div class="grid grid-4 mb-18">
            <div class="card stat"><span class="stat-label">Income</span><span class="stat-value up">${fmt(s.income)}</span><span class="stat-sub">${monthLabel(currentMonth)}</span></div>
            <div class="card stat"><span class="stat-label">Expenses</span><span class="stat-value down">${fmt(s.expense)}</span><span class="stat-sub">${txs.filter(t=>t.amount<0).length} transactions</span></div>
            <div class="card stat"><span class="stat-label">Net</span><span class="stat-value ${s.net>=0?'up':'down'}">${fmtSigned(s.net)}</span><span class="stat-sub">${s.savingsRate.toFixed(0)}% savings rate</span></div>
            <div class="card stat"><span class="stat-label">Saved toward goals</span><span class="stat-value">${fmtShort(totalSaved)}</span><span class="stat-sub">of ${fmtShort(totalTarget)} target</span></div>
        </div>
        <div class="grid grid-2 mb-18">
            <div class="card">
                <h3>Spending by category</h3>
                ${breakdown.length ? `<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
                    <div>${Charts.donut(breakdown)}</div>
                    <div class="donut-legend" style="flex:1;min-width:160px">
                        ${breakdown.slice(0, 7).map(d => `<div class="li"><span class="dot" style="background:${d.color}"></span>${esc(d.label)}<span class="val">${fmt(d.value)}</span></div>`).join("")}
                    </div>
                </div>` : `<p class="muted">No expenses this period.</p>`}
            </div>
            <div class="card">
                <h3>Income vs expenses (recent months)</h3>
                ${series.length ? Charts.bars(series.map(m => ({ label: m.label, value: m.expense })), { fmt: fmtShort }) : `<p class="muted">Not enough history.</p>`}
                <p class="muted" style="font-size:12px;margin-top:8px">Bars show monthly expenses.</p>
            </div>
        </div>
        <div class="card">
            <div class="card-title-row"><h3>Recent transactions</h3><button class="link-btn" data-goto="transactions">View all →</button></div>
            <table class="table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
                <tbody>${recent.map(t => `<tr>
                    <td class="muted">${esc(t.date)}</td>
                    <td>${esc(t.description)}</td>
                    <td>${catChip(t.category)}</td>
                    <td style="text-align:right" class="${t.amount<0?'amount-neg':'amount-pos'}">${fmtSigned(t.amount)}</td>
                </tr>`).join("")}</tbody>
            </table>
        </div>`;
    }

    function renderTransactions() {
        const txs = Store.txForMonth(currentMonth).slice().sort((a, b) => b.date.localeCompare(a.date));
        const opts = Categorize.names().map(n => `<option>${n}</option>`).join("");
        return `
        <div class="section-head">
            <p class="muted">${txs.length} transactions · ${monthLabel(currentMonth)}</p>
            <button class="btn" id="addTxBtn">+ Add transaction</button>
        </div>
        <div class="card">
            ${txs.length === 0 ? `<div class="empty"><div class="big">≡</div><p>No transactions for this period.</p></div>` : `
            <table class="table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th><th></th></tr></thead>
                <tbody>${txs.map(t => `<tr data-id="${t.id}">
                    <td class="muted">${esc(t.date)}</td>
                    <td>${esc(t.description)}</td>
                    <td><select class="cat-select" data-recat="${t.id}">${Categorize.names().map(n => `<option ${n===t.category?"selected":""}>${n}</option>`).join("")}</select></td>
                    <td style="text-align:right" class="${t.amount<0?'amount-neg':'amount-pos'}">${fmtSigned(t.amount)}</td>
                    <td style="text-align:right"><button class="link-btn danger" data-deltx="${t.id}">Delete</button></td>
                </tr>`).join("")}</tbody>
            </table>`}
        </div>
        <template id="catOpts">${opts}</template>`;
    }

    function renderUpload() {
        return `
        <div class="grid grid-2">
            <div>
                <div class="card mb-18">
                    <h3>Import a bank statement</h3>
                    <p class="muted" style="font-size:13px;margin-bottom:16px">Upload a CSV export from your bank. Fintrack auto-detects the date, description and amount columns, then extracts and categorizes each expense.</p>
                    <div class="dropzone" id="dropzone">
                        <div class="big">↥</div>
                        <p><strong>Click to choose a CSV file</strong><br>or drag &amp; drop it here</p>
                        <input type="file" id="fileInput" accept=".csv,text/csv" hidden>
                    </div>
                </div>
                <div class="card">
                    <h3>Or paste statement text</h3>
                    <textarea id="pasteArea" placeholder="date,description,amount&#10;2026-07-02,Whole Foods Market,-64.20&#10;2026-07-01,Payroll Deposit,2400.00" style="width:100%;min-height:120px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:9px;padding:12px;font-family:monospace;font-size:12.5px;color-scheme:dark"></textarea>
                    <button class="btn mt-18" id="parsePaste">Extract transactions</button>
                </div>
            </div>
            <div class="card">
                <h3>How it works</h3>
                <div class="metric-list">
                    <div class="metric"><div class="m-ico" style="background:rgba(76,141,255,.15);color:var(--accent)">1</div><div class="m-body"><h4>Export from your bank</h4><p>Most banks let you download transactions as CSV from statements or transaction history.</p></div></div>
                    <div class="metric"><div class="m-ico" style="background:rgba(124,92,255,.15);color:var(--accent-2)">2</div><div class="m-body"><h4>Upload here</h4><p>Columns are detected automatically — supports Amount, or separate Debit/Credit columns.</p></div></div>
                    <div class="metric"><div class="m-ico" style="background:rgba(63,185,80,.15);color:var(--green)">3</div><div class="m-body"><h4>Auto-categorized</h4><p>Each transaction is matched to a spending bucket. You can re-assign any category afterwards.</p></div></div>
                    <div class="metric"><div class="m-ico" style="background:rgba(210,153,34,.15);color:var(--amber)">4</div><div class="m-body"><h4>Private by design</h4><p>Everything is parsed and stored locally in your browser. No data leaves your device.</p></div></div>
                </div>
            </div>
        </div>`;
    }

    function renderBudgets() {
        const txs = Store.txForMonth(currentMonth);
        const s = summarize(txs);
        const cats = Categorize.names().filter(n => n !== "Income" && n !== "Savings");
        const rows = cats.map(cat => {
            const spent = s.byCat[cat] || 0;
            const limit = Store.state.budgets[cat] || 0;
            const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
            const over = limit > 0 && spent > limit;
            const color = over ? "var(--red)" : pct > 80 ? "var(--amber)" : "var(--green)";
            return `<div class="bar-row">
                <div class="bar-head">
                    <span>${catChip(cat)}</span>
                    <span class="muted">${fmt(spent)}${limit>0?` / <span style="color:${over?'var(--red)':'var(--text)'}">${fmt(limit)}</span>`:` <button class="link-btn" data-setbudget="${cat}">set budget</button>`}</span>
                </div>
                ${limit>0?`<div class="progress"><span style="width:${pct}%;background:${color}"></span></div>
                <div style="display:flex;justify-content:space-between;margin-top:5px"><span class="muted" style="font-size:12px">${over?`${fmt(spent-limit)} over budget`:`${fmt(limit-spent)} remaining`}</span><button class="link-btn" data-setbudget="${cat}">edit</button></div>`:""}
            </div>`;
        }).join("");

        const totalBudget = Object.values(Store.state.budgets).reduce((a, b) => a + b, 0);
        const totalSpent = cats.reduce((a, c) => a + (s.byCat[c] || 0), 0);

        return `
        <div class="grid grid-3 mb-18">
            <div class="card stat"><span class="stat-label">Total budgeted</span><span class="stat-value">${fmt(totalBudget)}</span></div>
            <div class="card stat"><span class="stat-label">Spent</span><span class="stat-value">${fmt(totalSpent)}</span></div>
            <div class="card stat"><span class="stat-label">Remaining</span><span class="stat-value ${totalBudget-totalSpent>=0?'up':'down'}">${fmtSigned(totalBudget-totalSpent)}</span></div>
        </div>
        <div class="card">
            <div class="card-title-row"><h3>Monthly budgets by bucket — ${monthLabel(currentMonth)}</h3></div>
            ${rows}
        </div>`;
    }

    function renderGoals() {
        const goals = Store.state.goals;
        return `
        <div class="section-head">
            <p class="muted">${goals.length} saving goal${goals.length===1?"":"s"}</p>
            <button class="btn" id="addGoalBtn">+ New goal</button>
        </div>
        ${goals.length === 0 ? `<div class="card"><div class="empty"><div class="big">◎</div><p>No saving goals yet. Create one to start tracking progress.</p><button class="btn" id="addGoalBtn2">Create a goal</button></div></div>` : `
        <div class="grid grid-2">
        ${goals.map(g => {
            const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const remaining = Math.max(0, g.target - g.saved);
            let etaTxt = "";
            if (g.deadline) {
                const days = Math.ceil((new Date(g.deadline) - new Date()) / 86400000);
                etaTxt = days > 0 ? `${days} days left` : "Past deadline";
            }
            return `<div class="card">
                <div class="card-title-row"><h3>${esc(g.name)}</h3><span class="muted" style="font-size:12.5px">${etaTxt}</span></div>
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
                    <span style="font-size:22px;font-weight:700">${fmt(g.saved)}</span>
                    <span class="muted">of ${fmt(g.target)}</span>
                </div>
                <div class="progress"><span style="width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--accent-2))"></span></div>
                <div style="display:flex;justify-content:space-between;margin-top:8px">
                    <span class="muted" style="font-size:12.5px">${pct.toFixed(0)}% · ${fmt(remaining)} to go</span>
                    <div class="row-actions">
                        <button class="link-btn" data-contribute="${g.id}">+ Add funds</button>
                        <button class="link-btn" data-editgoal="${g.id}">Edit</button>
                        <button class="link-btn danger" data-delgoal="${g.id}">Delete</button>
                    </div>
                </div>
            </div>`;
        }).join("")}
        </div>`}`;
    }

    function renderHabits() {
        const all = Store.state.transactions;
        if (!all.length) return `<div class="empty"><div class="big">∿</div><p>Import transactions to analyze your spending habits.</p></div>`;

        const s = summarize(Store.txForMonth(currentMonth));
        const breakdown = catBreakdown(s.byCat);
        const series = monthlySeries(6);

        // recurring merchants (appear 2+ months or 3+ times)
        const merchantMap = {};
        all.filter(t => t.amount < 0).forEach(t => {
            const key = t.description.replace(/\d+/g, "").trim().toLowerCase().slice(0, 28) || t.description;
            if (!merchantMap[key]) merchantMap[key] = { name: t.description, count: 0, total: 0, months: new Set() };
            merchantMap[key].count++;
            merchantMap[key].total += -t.amount;
            merchantMap[key].months.add((t.date || "").slice(0, 7));
        });
        const recurring = Object.values(merchantMap).filter(m => m.count >= 3 || m.months.size >= 2)
            .sort((a, b) => b.total - a.total).slice(0, 6);

        // biggest single expenses this period
        const biggest = Store.txForMonth(currentMonth).filter(t => t.amount < 0)
            .sort((a, b) => a.amount - b.amount).slice(0, 5);

        // avg daily spend
        const days = new Set(Store.txForMonth(currentMonth).map(t => t.date)).size || 1;
        const avgDaily = s.expense / days;

        // trend vs previous month
        let trendTxt = "", trendClass = "muted";
        if (series.length >= 2) {
            const cur = series[series.length - 1].expense;
            const prev = series[series.length - 2].expense;
            if (prev > 0) {
                const diff = ((cur - prev) / prev) * 100;
                trendClass = diff > 0 ? "down" : "up";
                trendTxt = `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(0)}% vs previous month`;
            }
        }

        return `
        <div class="grid grid-3 mb-18">
            <div class="card stat"><span class="stat-label">Avg. daily spend</span><span class="stat-value">${fmt(avgDaily)}</span><span class="stat-sub">${monthLabel(currentMonth)}</span></div>
            <div class="card stat"><span class="stat-label">Top category</span><span class="stat-value" style="font-size:22px">${breakdown[0]?esc(breakdown[0].label):"—"}</span><span class="stat-sub">${breakdown[0]?fmt(breakdown[0].value):""}</span></div>
            <div class="card stat"><span class="stat-label">Monthly trend</span><span class="stat-value ${trendClass}" style="font-size:20px">${trendTxt||"—"}</span><span class="stat-sub">expenses</span></div>
        </div>
        <div class="grid grid-2 mb-18">
            <div class="card">
                <h3>Recurring & subscriptions</h3>
                ${recurring.length ? `<table class="table"><tbody>${recurring.map(m => `<tr>
                    <td>${esc(m.name)}</td>
                    <td class="muted" style="text-align:right">${m.count}× · ${fmt(m.total)}</td>
                </tr>`).join("")}</tbody></table>` : `<p class="muted">No recurring patterns detected yet.</p>`}
            </div>
            <div class="card">
                <h3>Biggest expenses — ${monthLabel(currentMonth)}</h3>
                ${biggest.length ? `<table class="table"><tbody>${biggest.map(t => `<tr>
                    <td>${esc(t.description)}<br><span class="muted" style="font-size:11.5px">${esc(t.date)} · ${esc(t.category)}</span></td>
                    <td class="amount-neg" style="text-align:right">${fmt(t.amount)}</td>
                </tr>`).join("")}</tbody></table>` : `<p class="muted">No expenses this period.</p>`}
            </div>
        </div>
        <div class="card">
            <h3>Monthly expense trend</h3>
            ${Charts.bars(series.map(m => ({ label: m.label, value: m.expense })), { fmt: fmtShort })}
        </div>`;
    }

    // Financial health scoring
    function computeHealth() {
        const all = Store.state.transactions;
        const series = monthlySeries(3);
        // Use most recent complete month with data, else all
        const recentMonth = Store.availableMonths()[0] || null;
        const s = summarize(recentMonth ? Store.txForMonth(recentMonth) : all);
        const metrics = [];

        // 1. Savings rate (weight 30)
        let savingsPts, savingsStatus, savingsDesc;
        if (s.income <= 0) { savingsPts = 12; savingsStatus = "warn"; savingsDesc = "No income recorded this period."; }
        else if (s.savingsRate >= 20) { savingsPts = 30; savingsStatus = "good"; savingsDesc = `Saving ${s.savingsRate.toFixed(0)}% of income — excellent.`; }
        else if (s.savingsRate >= 10) { savingsPts = 22; savingsStatus = "warn"; savingsDesc = `Saving ${s.savingsRate.toFixed(0)}% — aim for 20%.`; }
        else if (s.savingsRate >= 0) { savingsPts = 12; savingsStatus = "warn"; savingsDesc = `Only ${s.savingsRate.toFixed(0)}% saved this period.`; }
        else { savingsPts = 3; savingsStatus = "bad"; savingsDesc = `Spending exceeds income by ${fmt(-s.net)}.`; }
        metrics.push({ title: "Savings rate", desc: savingsDesc, status: savingsStatus, ico: "%" });

        // 2. Budget adherence (weight 25)
        const budgets = Store.state.budgets;
        const budgetCats = Object.keys(budgets);
        let budgetPts, budgetStatus, budgetDesc;
        if (budgetCats.length === 0) { budgetPts = 12; budgetStatus = "warn"; budgetDesc = "No budgets set — add budgets to track adherence."; }
        else {
            const over = budgetCats.filter(c => (s.byCat[c] || 0) > budgets[c]);
            const ratio = 1 - over.length / budgetCats.length;
            budgetPts = Math.round(ratio * 25);
            budgetStatus = over.length === 0 ? "good" : over.length <= budgetCats.length / 2 ? "warn" : "bad";
            budgetDesc = over.length === 0 ? "All budgets on track." : `${over.length} of ${budgetCats.length} budgets exceeded.`;
        }
        metrics.push({ title: "Budget adherence", desc: budgetDesc, status: budgetStatus, ico: "◑" });

        // 3. Spending trend (weight 20)
        let trendPts = 12, trendStatus = "warn", trendDesc = "Not enough history to assess trend.";
        if (series.length >= 2) {
            const cur = series[series.length - 1].expense;
            const prev = series[series.length - 2].expense;
            if (prev > 0) {
                const diff = ((cur - prev) / prev) * 100;
                if (diff <= 0) { trendPts = 20; trendStatus = "good"; trendDesc = `Spending down ${Math.abs(diff).toFixed(0)}% month-over-month.`; }
                else if (diff < 15) { trendPts = 13; trendStatus = "warn"; trendDesc = `Spending up ${diff.toFixed(0)}% — keep an eye on it.`; }
                else { trendPts = 5; trendStatus = "bad"; trendDesc = `Spending jumped ${diff.toFixed(0)}% vs last month.`; }
            }
        }
        metrics.push({ title: "Spending trend", desc: trendDesc, status: trendStatus, ico: "∿" });

        // 4. Emergency / goals progress (weight 15)
        const goals = Store.state.goals;
        let goalPts, goalStatus, goalDesc;
        if (goals.length === 0) { goalPts = 6; goalStatus = "warn"; goalDesc = "No saving goals — set one for a safety net."; }
        else {
            const avgPct = goals.reduce((a, g) => a + (g.target > 0 ? Math.min(1, g.saved / g.target) : 0), 0) / goals.length;
            goalPts = Math.round(avgPct * 15);
            goalStatus = avgPct >= 0.66 ? "good" : avgPct >= 0.33 ? "warn" : "bad";
            goalDesc = `Goals ${(avgPct * 100).toFixed(0)}% funded on average.`;
        }
        metrics.push({ title: "Goal progress", desc: goalDesc, status: goalStatus, ico: "◎" });

        // 5. Spending concentration (weight 10) — over-reliance on one category is risky/discretionary heavy
        let concPts = 6, concStatus = "warn", concDesc = "No expense data.";
        const bd = catBreakdown(s.byCat);
        if (bd.length) {
            const topShare = bd[0].value / (s.expense || 1);
            const discretionary = ["Dining", "Shopping", "Entertainment"].reduce((a, c) => a + (s.byCat[c] || 0), 0);
            const discShare = discretionary / (s.expense || 1);
            if (discShare < 0.3) { concPts = 10; concStatus = "good"; concDesc = `Discretionary spend is ${(discShare*100).toFixed(0)}% of expenses — well balanced.`; }
            else if (discShare < 0.45) { concPts = 6; concStatus = "warn"; concDesc = `Discretionary spend is ${(discShare*100).toFixed(0)}% of expenses.`; }
            else { concPts = 3; concStatus = "bad"; concDesc = `Discretionary spend is ${(discShare*100).toFixed(0)}% — a lot on wants.`; }
        }
        metrics.push({ title: "Spending balance", desc: concDesc, status: concStatus, ico: "⚖" });

        const score = Math.max(0, Math.min(100, savingsPts + budgetPts + trendPts + goalPts + concPts));
        return { score, metrics, summary: s };
    }

    function renderHealth() {
        if (!Store.state.transactions.length) return `<div class="empty"><div class="big">♥</div><p>Import transactions to run a financial health check.</p></div>`;
        const h = computeHealth();
        const label = h.score >= 75 ? "Healthy" : h.score >= 50 ? "Fair" : "Needs attention";
        const labelColor = h.score >= 75 ? "var(--green)" : h.score >= 50 ? "var(--amber)" : "var(--red)";
        return `
        <div class="grid grid-2">
            <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
                <div class="score-ring">
                    ${Charts.gauge(h.score)}
                    <div class="score-num"><strong>${h.score}</strong><small>out of 100</small></div>
                </div>
                <div style="text-align:center">
                    <div style="font-size:18px;font-weight:700;color:${labelColor}">${label}</div>
                    <p class="muted" style="font-size:13px;max-width:280px;margin-top:4px">Your overall financial health score, based on savings, budgeting, spending trends and goals.</p>
                </div>
            </div>
            <div class="card">
                <h3>Score breakdown</h3>
                <div class="metric-list">
                    ${h.metrics.map(m => {
                        const bg = m.status === "good" ? "rgba(63,185,80,.15)" : m.status === "warn" ? "rgba(210,153,34,.15)" : "rgba(248,81,73,.15)";
                        const fg = m.status === "good" ? "var(--green)" : m.status === "warn" ? "var(--amber)" : "var(--red)";
                        const badge = m.status === "good" ? "good" : m.status === "warn" ? "warn" : "bad";
                        const badgeTxt = m.status === "good" ? "Good" : m.status === "warn" ? "Watch" : "Action";
                        return `<div class="metric">
                            <div class="m-ico" style="background:${bg};color:${fg}">${m.ico}</div>
                            <div class="m-body" style="flex:1">
                                <div style="display:flex;justify-content:space-between;align-items:center"><h4>${m.title}</h4><span class="badge ${badge}">${badgeTxt}</span></div>
                                <p>${m.desc}</p>
                            </div>
                        </div>`;
                    }).join("")}
                </div>
            </div>
        </div>`;
    }

    // Advice engine — generates contextual financial + wellbeing tips
    function buildAdvice() {
        const tips = [];
        const recentMonth = Store.availableMonths()[0] || null;
        const s = summarize(recentMonth ? Store.txForMonth(recentMonth) : Store.state.transactions);
        const budgets = Store.state.budgets;
        const goals = Store.state.goals;
        const bd = catBreakdown(s.byCat);

        // Priority: overspending
        if (s.net < 0) {
            tips.push({ type: "priority", ico: "⚠", title: "You're spending more than you earn", body: `This period you're negative by ${fmt(-s.net)}. Identify one or two categories to cut back on, and pause non-essential purchases until you're back in the black.` });
        }
        // Savings rate
        if (s.income > 0 && s.savingsRate < 20 && s.net >= 0) {
            tips.push({ type: "", ico: "%", title: "Aim for a 20% savings rate", body: `You're currently saving ${s.savingsRate.toFixed(0)}% of income. Automating a transfer to savings on payday — "pay yourself first" — makes the target easier to hit.` });
        }
        if (s.savingsRate >= 20) {
            tips.push({ type: "positive", ico: "✓", title: "Great savings discipline", body: `You're saving ${s.savingsRate.toFixed(0)}% of your income — above the recommended 20%. Consider putting the surplus to work in an index fund or high-yield account.` });
        }
        // Discretionary
        const discretionary = ["Dining", "Shopping", "Entertainment"].reduce((a, c) => a + (s.byCat[c] || 0), 0);
        if (s.expense > 0 && discretionary / s.expense > 0.4) {
            tips.push({ type: "", ico: "🍽", title: "Discretionary spending is high", body: `Dining, shopping and entertainment make up ${((discretionary/s.expense)*100).toFixed(0)}% of your spending. Try a "48-hour rule" on non-essential buys — wait two days before purchasing.` });
        }
        // Top category
        if (bd.length && bd[0].value / (s.expense || 1) > 0.35) {
            tips.push({ type: "", ico: "◑", title: `${bd[0].label} dominates your spending`, body: `${bd[0].label} is ${((bd[0].value/s.expense)*100).toFixed(0)}% of expenses (${fmt(bd[0].value)}). Setting a budget for it can help keep it in check.` });
        }
        // No budgets
        if (Object.keys(budgets).length === 0) {
            tips.push({ type: "", ico: "◑", title: "Set up budgets", body: "You haven't set any budgets. Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings — then set a monthly limit per bucket." });
        }
        // No emergency goal
        if (goals.length === 0) {
            tips.push({ type: "", ico: "◎", title: "Build an emergency fund", body: "Aim for 3–6 months of essential expenses in an easily accessible account. Create a saving goal to track your progress toward this safety net." });
        }
        // Recurring subscriptions reminder
        tips.push({ type: "", ico: "🔁", title: "Audit your subscriptions", body: "Check the Spending Habits tab for recurring charges. Cancelling a few unused subscriptions is one of the fastest ways to free up cash each month." });

        // Wellbeing tips (always shown)
        const wellbeing = [
            { ico: "🧘", title: "Money and mind", body: "Financial stress is common — a 2023 study found ~70% of adults feel anxious about money. Checking your finances on a fixed schedule (rather than constantly) reduces anxiety while keeping you in control." },
            { ico: "🎯", title: "Focus on what you control", body: "You can't control markets or prices, but you can control your savings rate and habits. Small, consistent actions compound — automating even a small transfer builds momentum." },
            { ico: "🌱", title: "Celebrate small wins", body: "Hitting a mini-goal releases the same motivation as a big one. Break large goals into monthly milestones and acknowledge each step." },
            { ico: "💬", title: "Talk about money", body: "Money is often a taboo topic, which keeps stress hidden. Talking openly with a partner, friend, or advisor normalizes it and often surfaces practical solutions." }
        ];

        return { tips, wellbeing };
    }

    function renderAdvice() {
        if (!Store.state.transactions.length) {
            return `<div class="empty"><div class="big">✦</div><p>Import your transactions to get personalized financial advice.</p></div>` +
                renderWellbeingOnly();
        }
        const { tips, wellbeing } = buildAdvice();
        return `
        <div class="grid grid-2">
            <div>
                <h3 style="margin-bottom:14px">Personalized advice</h3>
                ${tips.map(t => `<div class="tip ${t.type}">
                    <div class="tip-ico">${t.ico}</div>
                    <div><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div>
                </div>`).join("")}
            </div>
            <div>
                <h3 style="margin-bottom:14px">Financial wellbeing</h3>
                ${wellbeing.map(t => `<div class="tip">
                    <div class="tip-ico">${t.ico}</div>
                    <div><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div>
                </div>`).join("")}
            </div>
        </div>`;
    }
    function renderWellbeingOnly() {
        const { wellbeing } = buildAdvice();
        return `<div style="max-width:640px;margin:0 auto"><h3 style="margin-bottom:14px">Financial wellbeing tips</h3>${wellbeing.map(t => `<div class="tip"><div class="tip-ico">${t.ico}</div><div><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div></div>`).join("")}</div>`;
    }

    /* ============================================================
       ROUTER
       ============================================================ */
    const VIEWS = {
        dashboard: { title: "Dashboard", render: renderDashboard },
        transactions: { title: "Transactions", render: renderTransactions },
        upload: { title: "Import Statement", render: renderUpload },
        budgets: { title: "Budgets", render: renderBudgets },
        goals: { title: "Saving Goals", render: renderGoals },
        habits: { title: "Spending Habits", render: renderHabits },
        health: { title: "Health Check", render: renderHealth },
        advice: { title: "Advice & Wellbeing", render: renderAdvice }
    };

    let activeView = "dashboard";

    function renderActive() {
        const v = VIEWS[activeView];
        $("#viewTitle").textContent = v.title;
        const el = $("#view-" + activeView);
        el.innerHTML = v.render();
        $$(".view").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        wireViewEvents();
    }

    function goTo(view) {
        activeView = view;
        $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
        renderActive();
    }

    /* ---------- global nav ---------- */
    $$(".nav-item").forEach(btn => btn.addEventListener("click", () => goTo(btn.dataset.view)));

    // month filter
    const monthInput = $("#monthFilter");
    monthInput.addEventListener("change", () => {
        currentMonth = monthInput.value || null;
        renderActive();
    });

    /* ---------- per-view event wiring ---------- */
    function wireViewEvents() {
        // navigation shortcuts
        $$("[data-goto]").forEach(b => b.addEventListener("click", () => goTo(b.dataset.goto)));

        // ----- transactions -----
        const addTx = $("#addTxBtn");
        if (addTx) addTx.addEventListener("click", openAddTx);
        $$("[data-recat]").forEach(sel => sel.addEventListener("change", e => {
            Store.updateTransaction(sel.dataset.recat, { category: e.target.value });
            toast("Category updated", "success");
        }));
        $$("[data-deltx]").forEach(b => b.addEventListener("click", () => {
            Store.deleteTransaction(b.dataset.deltx);
            toast("Transaction deleted");
            renderActive();
        }));

        // ----- upload -----
        const dz = $("#dropzone"), fi = $("#fileInput");
        if (dz) {
            dz.addEventListener("click", () => fi.click());
            dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag"); });
            dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
            dz.addEventListener("drop", e => {
                e.preventDefault(); dz.classList.remove("drag");
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            });
            fi.addEventListener("change", () => { if (fi.files[0]) handleFile(fi.files[0]); });
        }
        const pp = $("#parsePaste");
        if (pp) pp.addEventListener("click", () => {
            const text = $("#pasteArea").value;
            if (!text.trim()) return toast("Paste some CSV text first", "error");
            ingestStatement(text);
        });

        // ----- budgets -----
        $$("[data-setbudget]").forEach(b => b.addEventListener("click", () => openSetBudget(b.dataset.setbudget)));

        // ----- goals -----
        ["#addGoalBtn", "#addGoalBtn2"].forEach(id => { const el = $(id); if (el) el.addEventListener("click", () => openGoalModal()); });
        $$("[data-editgoal]").forEach(b => b.addEventListener("click", () => openGoalModal(b.dataset.editgoal)));
        $$("[data-delgoal]").forEach(b => b.addEventListener("click", () => {
            Store.deleteGoal(b.dataset.delgoal); toast("Goal deleted"); renderActive();
        }));
        $$("[data-contribute]").forEach(b => b.addEventListener("click", () => openContribute(b.dataset.contribute)));
    }

    /* ---------- statement ingestion ---------- */
    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = e => ingestStatement(e.target.result);
        reader.onerror = () => toast("Could not read file", "error");
        reader.readAsText(file);
    }
    function ingestStatement(text) {
        const res = Categorize.parseStatement(text);
        if (res.error) return toast(res.error, "error");
        if (!res.transactions.length) return toast("No transactions found — check the file format.", "error");
        Store.addTransactions(res.transactions);
        refreshMonthOptions();
        const skippedTxt = res.skipped ? ` (${res.skipped} rows skipped)` : "";
        toast(`Imported ${res.transactions.length} transactions${skippedTxt}`, "success");
        goTo("transactions");
    }

    /* ---------- modals ---------- */
    function openAddTx() {
        const opts = Categorize.names().map(n => `<option>${n}</option>`).join("");
        openModal(`<h3>Add transaction</h3>
            <div class="form-row"><label>Date</label><input type="date" id="mDate" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="form-row"><label>Description</label><input id="mDesc" placeholder="e.g. Grocery store"></div>
            <div class="form-grid">
                <div class="form-row"><label>Amount (negative = expense)</label><input id="mAmt" type="number" step="0.01" placeholder="-25.00"></div>
                <div class="form-row"><label>Category</label><select id="mCat">${opts}</select></div>
            </div>
            <div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">Add</button></div>`);
        $("#mDesc").addEventListener("input", () => {
            const guess = Categorize.categorize($("#mDesc").value, Number($("#mAmt").value));
            $("#mCat").value = guess;
        });
        $("#mCancel").addEventListener("click", closeModal);
        $("#mSave").addEventListener("click", () => {
            const amt = Number($("#mAmt").value);
            if (!$("#mDesc").value.trim() || isNaN(amt) || amt === 0) return toast("Enter a description and non-zero amount", "error");
            Store.addTransaction({ date: $("#mDate").value, description: $("#mDesc").value, amount: amt, category: $("#mCat").value });
            Store.save(); refreshMonthOptions(); closeModal(); toast("Transaction added", "success"); renderActive();
        });
    }

    function openSetBudget(cat) {
        const cur = Store.state.budgets[cat] || "";
        openModal(`<h3>Budget for ${esc(cat)}</h3>
            <div class="form-row"><label>Monthly limit (${CUR()})</label><input id="bAmt" type="number" step="1" value="${cur}" placeholder="e.g. 400"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="bCancel">Cancel</button><button class="btn" id="bSave">Save</button></div>`);
        $("#bCancel").addEventListener("click", closeModal);
        $("#bSave").addEventListener("click", () => {
            Store.setBudget(cat, $("#bAmt").value); closeModal(); toast("Budget saved", "success"); renderActive();
        });
    }

    function openGoalModal(id) {
        const g = id ? Store.state.goals.find(x => x.id === id) : null;
        openModal(`<h3>${g ? "Edit" : "New"} saving goal</h3>
            <div class="form-row"><label>Goal name</label><input id="gName" value="${g?esc(g.name):""}" placeholder="e.g. Emergency fund"></div>
            <div class="form-grid">
                <div class="form-row"><label>Target amount</label><input id="gTarget" type="number" step="1" value="${g?g.target:""}" placeholder="5000"></div>
                <div class="form-row"><label>Already saved</label><input id="gSaved" type="number" step="1" value="${g?g.saved:0}" placeholder="0"></div>
            </div>
            <div class="form-row"><label>Target date (optional)</label><input id="gDeadline" type="date" value="${g&&g.deadline?g.deadline:""}"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="gCancel">Cancel</button><button class="btn" id="gSave">${g?"Save":"Create"}</button></div>`);
        $("#gCancel").addEventListener("click", closeModal);
        $("#gSave").addEventListener("click", () => {
            const name = $("#gName").value.trim(), target = Number($("#gTarget").value);
            if (!name || isNaN(target) || target <= 0) return toast("Enter a name and target amount", "error");
            const data = { name, target, saved: Number($("#gSaved").value) || 0, deadline: $("#gDeadline").value || null };
            if (g) Store.updateGoal(g.id, data); else Store.addGoal(data);
            closeModal(); toast(g ? "Goal updated" : "Goal created", "success"); renderActive();
        });
    }

    function openContribute(id) {
        const g = Store.state.goals.find(x => x.id === id);
        openModal(`<h3>Add funds to ${esc(g.name)}</h3>
            <p class="muted" style="margin-bottom:14px">Currently ${fmt(g.saved)} of ${fmt(g.target)}.</p>
            <div class="form-row"><label>Amount to add</label><input id="cAmt" type="number" step="1" placeholder="100"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="cCancel">Cancel</button><button class="btn" id="cSave">Add funds</button></div>`);
        $("#cCancel").addEventListener("click", closeModal);
        $("#cSave").addEventListener("click", () => {
            const add = Number($("#cAmt").value);
            if (isNaN(add) || add === 0) return toast("Enter an amount", "error");
            Store.updateGoal(g.id, { saved: Math.max(0, g.saved + add) });
            closeModal(); toast("Funds added", "success"); renderActive();
        });
    }

    /* ---------- month options ---------- */
    function refreshMonthOptions() {
        const months = Store.availableMonths();
        if (months.length && !monthInput.value && currentMonth === null) {
            // leave as "all" by default; user picks
        }
        // set max to latest
        if (months.length) monthInput.max = months[0];
    }

    /* ---------- demo data ---------- */
    function loadDemo() {
        Store.reset();
        const today = new Date();
        const catByDesc = d => Categorize.categorize(d, -1);
        const merchants = {
            Groceries: ["Whole Foods Market", "Trader Joe's", "Safeway", "Costco Wholesale"],
            Dining: ["Starbucks", "Chipotle", "Uber Eats", "Local Bistro", "Dunkin"],
            Transport: ["Uber", "Shell Gas Station", "Metro Transit", "Chevron Fuel"],
            Utilities: ["Comcast Internet", "City Electric", "T-Mobile Phone Bill", "Water Utility"],
            Shopping: ["Amazon", "Target", "Best Buy", "H&M"],
            Entertainment: ["Netflix", "Spotify", "AMC Cinema", "Steam Games"],
            Health: ["CVS Pharmacy", "Anytime Fitness Gym", "Dental Clinic"],
            Housing: ["Monthly Rent"]
        };
        const ranges = {
            Groceries: [35, 120], Dining: [8, 45], Transport: [12, 70], Utilities: [40, 130],
            Shopping: [15, 160], Entertainment: [10, 60], Health: [15, 90], Housing: [1450, 1450]
        };
        const txs = [];
        for (let mAgo = 5; mAgo >= 0; mAgo--) {
            const base = new Date(today.getFullYear(), today.getMonth() - mAgo, 1);
            const y = base.getFullYear(), mo = base.getMonth();
            // salary
            txs.push({ date: `${y}-${String(mo+1).padStart(2,"0")}-01`, description: "Payroll Deposit — Acme Corp", amount: 4200 + Math.round(Math.random()*200), category: "Income" });
            // rent
            txs.push({ date: `${y}-${String(mo+1).padStart(2,"0")}-03`, description: "Monthly Rent", amount: -1450, category: "Housing" });
            // savings transfer
            txs.push({ date: `${y}-${String(mo+1).padStart(2,"0")}-05`, description: "Transfer to Savings", amount: -500, category: "Savings" });
            // random expenses
            const count = 22 + Math.floor(Math.random() * 10);
            for (let i = 0; i < count; i++) {
                const catNames = Object.keys(merchants).filter(c => c !== "Housing");
                const cat = catNames[Math.floor(Math.random() * catNames.length)];
                const merch = merchants[cat][Math.floor(Math.random() * merchants[cat].length)];
                const [lo, hi] = ranges[cat];
                const amt = -(lo + Math.random() * (hi - lo));
                const day = 2 + Math.floor(Math.random() * 26);
                txs.push({ date: `${y}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`, description: merch, amount: Math.round(amt * 100) / 100, category: catByDesc(merch) });
            }
        }
        Store.addTransactions(txs);
        // budgets
        Store.setBudget("Groceries", 500);
        Store.setBudget("Dining", 300);
        Store.setBudget("Transport", 250);
        Store.setBudget("Shopping", 300);
        Store.setBudget("Entertainment", 150);
        Store.setBudget("Utilities", 350);
        Store.setBudget("Health", 200);
        // goals
        Store.addGoal({ name: "Emergency Fund", target: 12000, saved: 6800, deadline: new Date(today.getFullYear() + 1, today.getMonth(), 1).toISOString().slice(0,10) });
        Store.addGoal({ name: "Vacation to Japan", target: 4000, saved: 1500, deadline: new Date(today.getFullYear(), today.getMonth() + 8, 1).toISOString().slice(0,10) });
        Store.addGoal({ name: "New Laptop", target: 2000, saved: 1750, deadline: null });
        refreshMonthOptions();
        currentMonth = null;
        monthInput.value = "";
        toast("Sample data loaded", "success");
        goTo("dashboard");
    }

    $("#loadDemo").addEventListener("click", loadDemo);
    $("#resetData").addEventListener("click", () => {
        openModal(`<h3>Reset all data?</h3><p class="muted" style="margin-bottom:18px">This permanently deletes all transactions, budgets and goals stored in this browser.</p>
            <div class="modal-actions"><button class="btn btn-ghost" id="rCancel">Cancel</button><button class="btn" style="background:var(--red)" id="rConfirm">Reset everything</button></div>`);
        $("#rCancel").addEventListener("click", closeModal);
        $("#rConfirm").addEventListener("click", () => {
            Store.reset(); currentMonth = null; monthInput.value = ""; closeModal(); toast("All data reset"); goTo("dashboard");
        });
    });

    /* ---------- boot ---------- */
    refreshMonthOptions();
    renderActive();
})();
