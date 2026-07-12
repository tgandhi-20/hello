/* ============================================================
   Fintrack — main application controller
   ============================================================ */
(function () {
    "use strict";

    const $ = sel => document.querySelector(sel);
    const $$ = sel => Array.from(document.querySelectorAll(sel));
    const CUR = () => Store.state.settings.currency || "$";

    let currentMonth = null;            // "YYYY-MM" or null = all time
    let txSearch = "", txCatFilter = "", txTagFilter = ""; // transactions view filters

    /* ---------- utils ---------- */
    const fmt = n => CUR() + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtSigned = n => (n < 0 ? "-" : "+") + fmt(n);
    const fmtShort = n => CUR() + Math.round(Math.abs(n)).toLocaleString();
    const fmtShortSigned = n => (n < 0 ? "-" : "+") + fmtShort(n);
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const catChip = name => `<span class="chip"><span class="dot" style="background:${Categorize.categoryColor(name)}"></span>${esc(name)}</span>`;
    const activeMonth = () => currentMonth || Finance.currentMonthKey();
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
        const first = $("#modal input, #modal select, #modal textarea");
        if (first) setTimeout(() => first.focus(), 30);
    }
    function closeModal() { $("#modalBackdrop").hidden = true; }
    $("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") closeModal(); });
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (!$("#modalBackdrop").hidden) closeModal();
        else if (!$("#sheetBackdrop").hidden) closeSheet();
    });

    /* ---------- analytics ---------- */
    function summarize(txs) {
        let income = 0, expense = 0, saved = 0;
        const byCat = {};
        txs.forEach(t => {
            const neutral = Categorize.isNeutral(t.category);
            if (neutral) { saved += Math.abs(t.amount) * (t.amount < 0 ? 1 : -1); return; } // net moved into savings
            if (t.amount >= 0) income += t.amount;
            else { expense += -t.amount; byCat[t.category] = (byCat[t.category] || 0) + (-t.amount); }
        });
        const net = income - expense; // money kept (not spent); includes anything transferred to savings
        return { income, expense, net, saved, savingsRate: income > 0 ? (net / income) * 100 : 0, byCat };
    }
    function catBreakdown(byCat) {
        return Object.entries(byCat)
            .map(([label, value]) => ({ label, value, color: Categorize.categoryColor(label) }))
            .sort((a, b) => b.value - a.value);
    }
    function monthlySeries(n = 6) {
        const byMonth = {};
        Store.state.transactions.forEach(t => {
            const m = (t.date || "").slice(0, 7);
            if (!m) return;
            if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 };
            if (t.amount >= 0) byMonth[m].income += t.amount; else byMonth[m].expense += -t.amount;
        });
        return Object.keys(byMonth).sort().slice(-n).map(m => ({
            month: m, label: new Date(m + "-01").toLocaleString(undefined, { month: "short" }), ...byMonth[m]
        }));
    }

    const ACCT_ICON = { Checking: "🏦", Savings: "💰", "Credit Card": "💳", Investment: "📈", Loan: "🏛", Cash: "💵", Other: "◈" };
    const CAT_ICON = { Housing: "🏠", Groceries: "🛒", Utilities: "💡", Transport: "🚗", Shopping: "🛍️", Health: "🩺", Entertainment: "🎬", Dining: "🍽️", Income: "💵", Savings: "🏦", Transfer: "🔁", Other: "📦" };
    const catIcon = name => CAT_ICON[name] || "🏷️";

    /* ============================================================
       DASHBOARD
       ============================================================ */
    /* Dashboard is a customizable set of widgets (Monarch-style):
       users can toggle and reorder them; the layout persists. */
    const DASH_WIDGETS = [
        { id: "overview", label: "Safe to spend & key numbers" },
        { id: "savings", label: "Potential savings" },
        { id: "insights", label: "Insights & alerts" },
        { id: "spending", label: "Spending by category" },
        { id: "billssubs", label: "Bills & subscriptions" },
        { id: "recent", label: "Recent transactions" }
    ];
    function widgetPrefs() {
        const saved = Store.state.settings.dashboardWidgets;
        const base = DASH_WIDGETS.map(w => ({ id: w.id, on: true }));
        if (!Array.isArray(saved) || !saved.length) return base;
        // keep saved order/toggles; append any new widgets added since
        const known = new Set(saved.map(w => w.id));
        return saved.filter(w => DASH_WIDGETS.some(d => d.id === w.id))
            .concat(base.filter(w => !known.has(w.id)));
    }

    function widgetOverview(ctx) {
        const { s, txs, nw, sts, pace } = ctx;
        const paceColor = pace.status === "over" ? "var(--red)" : pace.status === "fast" ? "var(--amber)" : "var(--green)";
        const paceMsg = pace.status === "over" ? `Projected to overspend — on track for ${fmtShort(pace.projectedEnd)}`
            : pace.status === "fast" ? `Spending a little fast this month` : `On track — projected ${fmtShort(pace.projectedEnd)}`;
        const paceFillPct = pace.plan > 0 ? Math.min(100, (pace.spent / pace.plan) * 100) : 0;
        const markerPct = pace.dim > 0 ? (pace.dayOfMonth / pace.dim) * 100 : 0;
        return `
        <div class="grid grid-2 mb-18">
            <div class="card hero">
                <span class="stat-label">Safe to spend · ${monthLabel(activeMonth())}</span>
                <div class="big-num ${sts.safe >= 0 ? "up" : "down"}">${fmt(sts.safe)}</div>
                <p class="muted" style="font-size:12.5px;margin-top:2px">After ${fmtShort(sts.spent)} spent${sts.goalReserve ? ` and ${fmtShort(sts.goalReserve)} reserved for goals` : ""} · income ${fmtShort(sts.income)}/mo</p>
                <div style="margin-top:16px">
                    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span class="muted">Spend pace</span><span style="color:${paceColor};font-weight:600">${fmtShort(pace.spent)} / ${fmtShort(pace.plan)}</span></div>
                    <div class="pace-bar"><div class="fill" style="width:${paceFillPct}%;background:${paceColor}"></div><div class="marker" style="left:${markerPct}%"></div></div>
                    <p class="muted" style="font-size:12px;margin-top:6px">${paceMsg}. Marker shows how far through the month you are.</p>
                </div>
            </div>
            <div class="grid grid-2" style="gap:16px">
                <div class="card stat"><span class="stat-label">Net worth</span><span class="stat-value ${nw.total>=0?"":"down"}">${fmtShort(nw.total)}</span><span class="stat-sub">${fmtShort(nw.assets)} assets · ${fmtShort(nw.liabilities)} debt</span></div>
                <div class="card stat"><span class="stat-label">Income</span><span class="stat-value up">${fmtShort(s.income)}</span><span class="stat-sub">${monthLabel(currentMonth)}</span></div>
                <div class="card stat"><span class="stat-label">Expenses</span><span class="stat-value down">${fmtShort(s.expense)}</span><span class="stat-sub">${txs.filter(t=>t.amount<0).length} transactions</span></div>
                <div class="card stat"><span class="stat-label">Net</span><span class="stat-value ${s.net>=0?"up":"down"}">${fmtShortSigned(s.net)}</span><span class="stat-sub">${s.savingsRate.toFixed(0)}% savings rate${s.saved>0?` · ${fmtShort(s.saved)} to savings`:""}</span></div>
            </div>
        </div>`;
    }
    function widgetSavings() {
        const sl = Finance.savingsLevers(activeMonth());
        if (!sl.levers.length) return "";
        const max = Math.max(...sl.levers.map(l => l.monthly), 1);
        const projection = [];
        for (let i = 0; i <= 12; i += 2) {
            const d = new Date(); d.setMonth(d.getMonth() + i);
            projection.push({ label: i === 0 ? "now" : d.toLocaleString(undefined, { month: "short" }), value: Math.round(sl.monthlyTotal * i) });
        }
        return `
        <div class="card mb-18">
            <div class="card-title-row"><h3>💸 Potential savings</h3>
                <span class="badge good">up to ${fmtShort(sl.monthlyTotal)}/mo · ${fmtShort(sl.yearlyTotal)}/yr</span></div>
            <div class="grid grid-2" style="gap:20px;align-items:start">
                <div>
                    ${sl.levers.map(l => `<div class="bar-row">
                        <div class="bar-head"><span>${esc(l.label)}</span><span class="muted">${fmt(l.monthly)}/mo</span></div>
                        <div class="progress"><span style="width:${(l.monthly / max) * 100}%;background:var(--green)"></span></div>
                        <p class="muted" style="font-size:11.5px;margin-top:4px">${esc(l.detail)}</p>
                    </div>`).join("")}
                </div>
                <div>
                    <p class="muted" style="font-size:12px;margin-bottom:6px">If you act on all of it — cumulative savings over 12 months</p>
                    ${Charts.line(projection, { fmt: fmtShort, color: "var(--green)" })}
                </div>
            </div>
        </div>`;
    }
    function widgetInsights() {
        const ins = Finance.insights(activeMonth());
        if (!ins.length) return "";
        const insIcon = { spike: "↑", drop: "↓", large: "◆", duplicate: "⧉" };
        const insColor = { bad: "var(--red)", warn: "var(--amber)", info: "var(--accent)", good: "var(--green)" };
        return `
        <div class="card mb-18">
            <h3>Insights · ${monthLabel(activeMonth())}</h3>
            <div class="metric-list">
                ${ins.map(i => `<div class="metric">
                    <div class="m-ico" style="background:color-mix(in srgb, ${insColor[i.severity]} 14%, transparent);color:${insColor[i.severity]}">${insIcon[i.kind] || "✦"}</div>
                    <div class="m-body" style="flex:1">
                        <div style="display:flex;justify-content:space-between;gap:10px"><h4>${esc(i.title)}</h4><span style="font-weight:700;white-space:nowrap">${fmt(i.value)}</span></div>
                        <p>${esc(i.detail)}</p>
                    </div>
                </div>`).join("")}
            </div>
        </div>`;
    }
    function widgetSpendingBillsSubs(ctx) {
        const { breakdown } = ctx;
        const upcoming = upcomingBills().slice(0, 4);
        const subsMo = Finance.monthlySubscriptions();
        const cancelledMo = Store.state.subscriptions.filter(x => !x.active)
            .reduce((a, x) => a + (x.cycle === "yearly" ? x.amount / 12 : x.amount), 0);
        const spendCard = `
            <div class="card">
                <h3>Spending by category</h3>
                ${breakdown.length ? `<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
                    <div>${Charts.donut(breakdown)}</div>
                    <div class="donut-legend" style="flex:1;min-width:160px">
                        ${breakdown.slice(0,7).map(d=>`<div class="li"><span class="dot" style="background:${d.color}"></span>${esc(d.label)}<span class="val">${fmt(d.value)}</span></div>`).join("")}
                    </div></div>` : `<p class="muted">No expenses this period.</p>`}
            </div>`;
        const billsCard = `
            <div class="card">
                <div class="card-title-row"><h3>Bills & subscriptions</h3><button class="link-btn" data-goto="subscriptions">Manage →</button></div>
                ${upcoming.length ? `<table class="table"><tbody>${upcoming.map(b=>`<tr>
                    <td>${esc(b.name)}<br><span class="muted" style="font-size:11.5px">Due day ${b.dueDay}</span></td>
                    <td style="text-align:right"><div>${fmt(b.amount)}</div><span class="due ${b.badge}">${b.dueText}</span></td>
                </tr>`).join("")}</tbody></table>` : `<p class="muted">No bills tracked. Add recurring bills to see reminders.</p>`}
                <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px">
                    <span class="muted">Subscriptions: <strong style="color:var(--text)">${fmt(subsMo)}/mo</strong></span>
                    ${cancelledMo > 0 ? `<span style="color:var(--green);font-weight:700">✓ Saving ${fmt(cancelledMo)}/mo (${fmtShort(cancelledMo*12)}/yr) from cancellations</span>` : `<button class="link-btn" data-goto="subscriptions">Find ones to cancel →</button>`}
                </div>
            </div>`;
        return { spendCard, billsCard };
    }
    function widgetRecent(ctx) {
        const recent = ctx.txs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
        return `
        <div class="card mb-18">
            <div class="card-title-row"><h3>Recent transactions</h3><button class="link-btn" data-goto="transactions">View all →</button></div>
            ${recent.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
                <tbody>${recent.map(t=>`<tr>
                    <td class="muted">${esc(t.date)}</td><td>${esc(t.description)}</td><td>${catChip(t.category)}</td>
                    <td style="text-align:right" class="${t.amount<0?"amount-neg":"amount-pos"}">${fmtSigned(t.amount)}</td>
                </tr>`).join("")}</tbody></table></div>` : `<p class="muted">No transactions this period.</p>`}
        </div>`;
    }

    function renderDashboard() {
        if (Store.state.transactions.length === 0 && Store.state.accounts.length === 0) {
            return `<div class="empty"><div class="big">◧</div>
                <p>No data yet. Import a bank statement or load sample data to get started.</p>
                <button class="btn" data-goto="upload">Import a statement</button></div>`;
        }
        const txs = Store.txForMonth(currentMonth);
        const s = summarize(txs);
        const ctx = {
            txs, s,
            breakdown: catBreakdown(s.byCat),
            nw: Finance.netWorth(),
            sts: Finance.safeToSpend(activeMonth()),
            pace: Finance.spendPace(activeMonth())
        };
        const pieces = [];
        widgetPrefs().forEach(w => {
            if (!w.on) return;
            if (w.id === "overview") pieces.push(widgetOverview(ctx));
            else if (w.id === "savings") pieces.push(widgetSavings());
            else if (w.id === "insights") pieces.push(widgetInsights());
            else if (w.id === "spending" || w.id === "billssubs") {
                // spending + bills/subs pair into one row when both enabled and adjacent
                const cards = widgetSpendingBillsSubs(ctx);
                const other = w.id === "spending" ? "billssubs" : "spending";
                const prefs = widgetPrefs();
                const bothOn = prefs.find(x => x.id === other && x.on);
                const alreadyRendered = pieces.some(p => p.includes('data-dashrow="spendbills"'));
                if (alreadyRendered) return;
                if (bothOn) pieces.push(`<div class="grid grid-2 mb-18" data-dashrow="spendbills">${cards.spendCard}${cards.billsCard}</div>`);
                else pieces.push(`<div class="mb-18" data-dashrow="spendbills">${w.id === "spending" ? cards.spendCard : cards.billsCard}</div>`);
            }
            else if (w.id === "recent") pieces.push(widgetRecent(ctx));
        });
        return `
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
            <button class="btn btn-sm btn-ghost" id="customizeDash">⚙ Customize layout</button>
        </div>
        ${pieces.join("")}`;
    }

    function openCustomizeDash() {
        let prefs = widgetPrefs();
        function body() {
            return `<h3>Customize dashboard</h3>
            <p class="muted" style="font-size:12.5px;margin-bottom:14px">Show, hide and reorder your dashboard — it's your money, your layout.</p>
            ${prefs.map((w, i) => {
                const def = DASH_WIDGETS.find(d => d.id === w.id);
                return `<div class="acct-row" style="flex-wrap:nowrap">
                    <label class="switch" style="flex:1;min-width:0"><input type="checkbox" data-wtog="${i}" ${w.on ? "checked" : ""}><span class="track"></span><span style="overflow:hidden;text-overflow:ellipsis">${esc(def.label)}</span></label>
                    <button class="btn-ghost btn-sm btn" data-wup="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
                    <button class="btn-ghost btn-sm btn" data-wdn="${i}" ${i === prefs.length - 1 ? "disabled" : ""}>↓</button>
                </div>`;
            }).join("")}
            <div class="modal-actions"><button class="btn btn-ghost" id="wCancel">Cancel</button><button class="btn" id="wSave">Save layout</button></div>`;
        }
        function refresh() { openModal(body()); wire(); }
        function wire() {
            $$("[data-wtog]").forEach(cb => cb.addEventListener("change", e => { prefs[Number(cb.dataset.wtog)].on = e.target.checked; }));
            $$("[data-wup]").forEach(b => b.addEventListener("click", () => { const i = Number(b.dataset.wup); [prefs[i-1], prefs[i]] = [prefs[i], prefs[i-1]]; refresh(); }));
            $$("[data-wdn]").forEach(b => b.addEventListener("click", () => { const i = Number(b.dataset.wdn); [prefs[i+1], prefs[i]] = [prefs[i], prefs[i+1]]; refresh(); }));
            bindClick("#wCancel", closeModal);
            bindClick("#wSave", () => { Store.updateSettings({ dashboardWidgets: prefs }); closeModal(); toast("Dashboard layout saved", "success"); renderActive(); });
        }
        refresh();
    }

    /* ============================================================
       NET WORTH
       ============================================================ */
    function renderNetWorth() {
        const accts = Store.state.accounts;
        const nw = Finance.netWorth();
        const snaps = Store.state.netWorthSnapshots;
        const assets = accts.filter(a => a.kind !== "liability");
        const liabilities = accts.filter(a => a.kind === "liability");

        const acctRow = a => `<div class="acct-row">
            <div class="acct-ico">${ACCT_ICON[a.type] || "◈"}</div>
            <div><div class="acct-name">${esc(a.name)}</div><div class="acct-type">${esc(a.type)}${a.apr?` · ${a.apr}% APR`:""}${a.currency?` · ${esc(a.currency)} @ ${a.rate}`:""}</div></div>
            <div class="acct-bal ${a.kind==="liability"?"down":""}">${a.kind==="liability"?"-":""}${a.currency
                ? `${esc(a.currency)}${Math.abs(a.balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}<span class="muted" style="font-size:11px;font-weight:500"> ≈ ${fmt(a.balance*(a.rate||1))}</span>`
                : fmt(a.balance)}</div>
            <div class="row-actions" style="margin-left:12px">
                <button class="link-btn" data-editacct="${a.id}">Edit</button>
                <button class="link-btn danger" data-delacct="${a.id}">×</button>
            </div>
        </div>`;

        // debt payoff summary
        const debtCards = liabilities.map(a => {
            const pay = a.minPayment || Math.max(25, Math.abs(a.balance) * 0.03);
            const months = Finance.payoffMonths(a.balance, a.apr, pay);
            const interest = Finance.totalInterest(a.balance, a.apr, pay);
            return `<div class="bar-row">
                <div class="bar-head"><span>${esc(a.name)}</span><span class="muted">${fmt(a.balance)} @ ${a.apr||0}%</span></div>
                <p class="muted" style="font-size:12.5px">${isFinite(months)?`Paying ${fmt(pay)}/mo → debt-free in <strong style="color:var(--text)">${months} months</strong> (${fmt(interest)} interest)`:`Minimum payment won't cover interest — increase it to make progress.`}</p>
            </div>`;
        }).join("");

        return `
        <div class="grid grid-3 mb-18">
            <div class="card stat"><span class="stat-label">Net worth</span><span class="stat-value ${nw.total>=0?"":"down"}">${fmt(nw.total)}</span><span class="stat-sub">assets minus liabilities</span></div>
            <div class="card stat"><span class="stat-label">Total assets</span><span class="stat-value up">${fmt(nw.assets)}</span><span class="stat-sub">${assets.length} accounts</span></div>
            <div class="card stat"><span class="stat-label">Total debt</span><span class="stat-value down">${fmt(nw.liabilities)}</span><span class="stat-sub">${liabilities.length} accounts</span></div>
        </div>
        ${snaps.length >= 2 ? `<div class="card mb-18"><div class="card-title-row"><h3>Net worth trend</h3><button class="btn btn-sm btn-ghost" id="snapNow">Save snapshot</button></div>
            ${Charts.line(snaps.slice(-12).map(s => ({ label: s.date.slice(5), value: s.value })), { fmt: fmtShort })}</div>`
        : `<div class="card mb-18" style="display:flex;justify-content:space-between;align-items:center"><p class="muted">Save monthly snapshots to chart your net worth over time.</p><button class="btn btn-sm" id="snapNow">Save snapshot</button></div>`}
        <div class="grid grid-2">
            <div class="card">
                <div class="card-title-row"><h3>Accounts</h3><button class="btn btn-sm" id="addAcctBtn">+ Add account</button></div>
                ${accts.length ? `<div style="margin-bottom:10px"><div class="acct-type" style="margin-bottom:2px">ASSETS</div>${assets.map(acctRow).join("")||'<p class="muted" style="font-size:12.5px">None</p>'}</div>
                <div><div class="acct-type" style="margin:12px 0 2px">LIABILITIES</div>${liabilities.map(acctRow).join("")||'<p class="muted" style="font-size:12.5px">None</p>'}</div>`
                : `<div class="empty" style="padding:30px"><div class="big">◈</div><p>Add your accounts to track net worth.</p><button class="btn" id="addAcctBtn2">Add an account</button></div>`}
            </div>
            <div class="card">
                <h3>Debt payoff</h3>
                ${liabilities.length ? debtCards : `<p class="muted">No debts tracked. Add a credit card or loan account to see a payoff plan.</p>`}
            </div>
        </div>`;
    }

    /* ============================================================
       REPORTS
       ============================================================ */
    function renderReports() {
        if (!Store.state.transactions.length) return `<div class="empty"><div class="big">▤</div><p>Import transactions to see reports and insights.</p></div>`;
        const series = monthlySeries(6);
        const forecast = Finance.cashFlowForecast(6);

        // month comparison (current vs previous available)
        const months = Store.availableMonths();
        const cur = months[0], prev = months[1];
        const curS = cur ? summarize(Store.txForMonth(cur)) : null;
        const prevS = prev ? summarize(Store.txForMonth(prev)) : null;

        // category trend table (top 6 categories across period)
        const allCats = {};
        Store.state.transactions.filter(t => t.amount < 0).forEach(t => allCats[t.category] = (allCats[t.category] || 0) + (-t.amount));
        const topCats = Object.entries(allCats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
        const catByMonth = m => { const o = {}; Store.txForMonth(m).filter(t => t.amount < 0).forEach(t => o[t.category] = (o[t.category] || 0) + (-t.amount)); return o; };

        return `
        <div class="grid grid-2 mb-18">
            <div class="card">
                <h3>Income vs expenses</h3>
                <div style="display:flex;gap:10px;margin-bottom:10px;font-size:12.5px"><span><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--green)"></span> Income</span><span><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--red)"></span> Expenses</span></div>
                ${incomeExpenseBars(series)}
            </div>
            <div class="card">
                <h3>Cash-flow forecast (6 months)</h3>
                ${Charts.line(forecast.points, { fmt: fmtShort, color: forecast.monthlyNet >= 0 ? "var(--green)" : "var(--red)" })}
                <p class="muted" style="font-size:12.5px;margin-top:8px">Projecting ${fmtShortSigned(forecast.monthlyNet)}/mo from ${fmtShort(forecast.startCash)} in cash. ${forecast.monthlyNet>=0?"You're building a surplus.":"At this rate cash is shrinking — review spending."}</p>
            </div>
        </div>
        <div class="grid grid-2 mb-18">
            <div class="card">
                <h3>This month vs last</h3>
                ${curS && prevS ? `<table class="table"><thead><tr><th>Metric</th><th style="text-align:right">${monthLabel(prev)}</th><th style="text-align:right">${monthLabel(cur)}</th><th style="text-align:right">Δ</th></tr></thead><tbody>
                    ${[["Income", prevS.income, curS.income],["Expenses", prevS.expense, curS.expense],["Net", prevS.net, curS.net]].map(([k,p,c])=>{
                        const d = c - p; const cls = (k==="Expenses"? d<=0:d>=0)?"up":"down";
                        return `<tr><td>${k}</td><td style="text-align:right" class="muted">${fmt(p)}</td><td style="text-align:right">${fmt(c)}</td><td style="text-align:right" class="${cls}">${fmtSigned(d)}</td></tr>`;
                    }).join("")}
                </tbody></table>` : `<p class="muted">Need at least two months of data to compare.</p>`}
            </div>
            <div class="card">
                <h3>Category trend</h3>
                <div class="table-wrap"><table class="table"><thead><tr><th>Category</th>${series.slice(-4).map(m=>`<th style="text-align:right">${m.label}</th>`).join("")}</tr></thead><tbody>
                    ${topCats.map(cat=>`<tr><td>${catChip(cat)}</td>${series.slice(-4).map(m=>{const v=catByMonth(m.month)[cat]||0;return `<td style="text-align:right" class="${v?"":"muted"}">${v?fmtShort(v):"—"}</td>`}).join("")}</tr>`).join("")}
                </tbody></table></div>
            </div>
        </div>
        ${renderMemberSpend()}`;
    }
    function renderMemberSpend() {
        const members = Store.state.members;
        if (!members.length) return "";
        const txs = Store.txForMonth(currentMonth).filter(t => t.amount < 0 && !Categorize.isNeutral(t.category));
        const byMember = {};
        let unassigned = 0;
        txs.forEach(t => {
            if (t.member) byMember[t.member] = (byMember[t.member] || 0) + (-t.amount);
            else unassigned += -t.amount;
        });
        const total = txs.reduce((a, t) => a + (-t.amount), 0) || 1;
        const rows = members.map(m => ({ name: m.name, v: byMember[m.id] || 0 }))
            .concat(unassigned > 0 ? [{ name: "Unassigned", v: unassigned }] : [])
            .sort((a, b) => b.v - a.v);
        return `<div class="card mt-18">
            <h3>Spending by member — ${monthLabel(currentMonth)}</h3>
            ${rows.map(r => `<div class="bar-row">
                <div class="bar-head"><span>${r.name === "Unassigned" ? `<span class="muted">${esc(r.name)}</span>` : `<span class="member-chip">${esc(r.name.slice(0,2).toUpperCase())}</span> ${esc(r.name)}`}</span>
                    <span class="muted">${fmt(r.v)} · ${Math.round((r.v/total)*100)}%</span></div>
                <div class="progress"><span style="width:${(r.v/total)*100}%;background:var(--accent)"></span></div>
            </div>`).join("")}
        </div>`;
    }
    function incomeExpenseBars(series) {
        const max = Math.max(1, ...series.map(m => Math.max(m.income, m.expense)));
        return `<div class="bar-chart" style="height:170px">${series.map(m => `<div class="bcol" title="${m.label}: income ${fmtShort(m.income)}, expense ${fmtShort(m.expense)}">
            <div style="display:flex;gap:3px;align-items:flex-end;height:100%;width:100%;justify-content:center">
                <div class="bfill" style="height:${(m.income/max)*100}%;max-width:16px;background:var(--green)"></div>
                <div class="bfill" style="height:${(m.expense/max)*100}%;max-width:16px;background:var(--red)"></div>
            </div><div class="blabel">${m.label}</div></div>`).join("")}</div>`;
    }

    /* ============================================================
       TRANSACTIONS (with search + filter + notes)
       ============================================================ */
    function renderTransactions() {
        let txs = Store.txForMonth(currentMonth).slice().sort((a, b) => b.date.localeCompare(a.date));
        if (txSearch) { const q = txSearch.toLowerCase(); txs = txs.filter(t => t.description.toLowerCase().includes(q) || (t.note||"").toLowerCase().includes(q) || (t.tags||[]).some(tag => tag.toLowerCase().includes(q))); }
        if (txCatFilter) txs = txs.filter(t => t.category === txCatFilter);
        if (txTagFilter) txs = txs.filter(t => (t.tags || []).includes(txTagFilter));
        const allTags = Array.from(new Set(Store.state.transactions.flatMap(t => t.tags || []))).sort();
        const catOptions = `<option value="">All categories</option>` + Categorize.names().map(n => `<option ${n===txCatFilter?"selected":""}>${n}</option>`).join("");
        const tagOptions = `<option value="">All tags</option>` + allTags.map(t => `<option ${t===txTagFilter?"selected":""}>${esc(t)}</option>`).join("");
        return `
        <div class="section-head">
            <p class="muted">${txs.length} transactions · ${monthLabel(currentMonth)}</p>
            <div class="row-actions">
                <button class="btn btn-ghost" id="exportCsvBtn">Export CSV</button>
                <button class="btn" id="addTxBtn">+ Add transaction</button>
            </div>
        </div>
        <div class="filter-bar">
            <input class="search-input" id="txSearch" placeholder="Search description, note or tag…" value="${esc(txSearch)}">
            <select class="cat-select" id="txCatFilter" style="padding:9px 12px">${catOptions}</select>
            ${allTags.length ? `<select class="cat-select" id="txTagFilter" style="padding:9px 12px">${tagOptions}</select>` : ""}
        </div>
        <div class="card">
            ${txs.length === 0 ? `<div class="empty"><div class="big">≡</div><p>No transactions match.</p></div>` : `
            <div class="table-wrap"><table class="table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th><th></th></tr></thead>
                <tbody>${txs.map(t => `<tr data-id="${t.id}">
                    <td class="muted">${esc(t.date)}</td>
                    <td>${esc(t.description)}${t.member?(m=>m?` <span class="member-chip" title="${esc(m.name)}">${esc(m.name.slice(0,2).toUpperCase())}</span>`:"")(Store.state.members.find(x=>x.id===t.member)):""}${(t.tags&&t.tags.length)?` ${t.tags.map(tag=>`<span class="tag-chip" data-tagclick="${esc(tag)}">#${esc(tag)}</span>`).join(" ")}`:""}${t.note?`<br><span class="muted" style="font-size:11.5px">📝 ${esc(t.note)}</span>`:""}</td>
                    <td><select class="cat-select" data-recat="${t.id}">${Categorize.names().map(n => `<option ${n===t.category?"selected":""}>${n}</option>`).join("")}</select></td>
                    <td style="text-align:right" class="${t.amount<0?"amount-neg":"amount-pos"}">${fmtSigned(t.amount)}</td>
                    <td style="text-align:right;white-space:nowrap">${t.amount<0?`<button class="link-btn" data-splittx="${t.id}">Split</button> `:""}<button class="link-btn" data-edittx="${t.id}">Edit</button> <button class="link-btn danger" data-deltx="${t.id}">Delete</button></td>
                </tr>`).join("")}</tbody>
            </table></div>`}
        </div>`;
    }

    /* ============================================================
       UPLOAD
       ============================================================ */
    function renderUpload() {
        return `
        <div class="grid grid-2">
            <div>
                <div class="card mb-18">
                    <h3>Import a bank statement</h3>
                    <p class="muted" style="font-size:13px;margin-bottom:16px">Upload a CSV export from your bank. Fintrack auto-detects the date, description and amount columns, then extracts and categorizes each expense.</p>
                    <div class="dropzone" id="dropzone"><div class="big">↥</div>
                        <p><strong>Click to choose a CSV file</strong><br>or drag &amp; drop it here</p>
                        <input type="file" id="fileInput" accept=".csv,text/csv" hidden></div>
                </div>
                <div class="card">
                    <h3>Or paste statement text</h3>
                    <textarea id="pasteArea" class="form-area" placeholder="date,description,amount&#10;2026-07-02,Whole Foods Market,-64.20&#10;2026-07-01,Payroll Deposit,2400.00"></textarea>
                    <button class="btn mt-18" id="parsePaste">Extract transactions</button>
                </div>
            </div>
            <div class="card">
                <h3>How it works</h3>
                <div class="metric-list">
                    <div class="metric"><div class="m-ico" style="background:rgba(76,141,255,.15);color:var(--accent)">1</div><div class="m-body"><h4>Export from your bank</h4><p>Most banks let you download transactions as CSV from statements or transaction history.</p></div></div>
                    <div class="metric"><div class="m-ico" style="background:rgba(124,92,255,.15);color:var(--accent-2)">2</div><div class="m-body"><h4>Upload here</h4><p>Columns are detected automatically — supports Amount, or separate Debit/Credit columns.</p></div></div>
                    <div class="metric"><div class="m-ico" style="background:rgba(63,185,80,.15);color:var(--green)">3</div><div class="m-body"><h4>Auto-categorized</h4><p>Each transaction is matched to a spending bucket. Re-assign any category afterwards.</p></div></div>
                    <div class="metric"><div class="m-ico" style="background:rgba(210,153,34,.15);color:var(--amber)">4</div><div class="m-body"><h4>Private by design</h4><p>Everything is parsed and stored locally in your browser. No data leaves your device.</p></div></div>
                </div>
            </div>
        </div>`;
    }

    /* ============================================================
       BILLS
       ============================================================ */
    function upcomingBills() {
        const now = new Date();
        const today = now.getDate();
        const thisMonth = now.toISOString().slice(0, 7);
        return Store.state.bills.map(b => {
            const paid = b.paidMonths.includes(thisMonth);
            let diff = b.dueDay - today;
            let badge, dueText;
            if (paid) { badge = "paid"; dueText = "Paid"; }
            else if (diff < 0) { badge = "overdue"; dueText = `${-diff}d overdue`; }
            else if (diff === 0) { badge = "soon"; dueText = "Due today"; }
            else if (diff <= 7) { badge = "soon"; dueText = `In ${diff}d`; }
            else { badge = "later"; dueText = `In ${diff}d`; }
            return { ...b, paid, diff, badge, dueText, sortKey: paid ? 999 : diff };
        }).sort((a, b) => a.sortKey - b.sortKey);
    }
    function renderBills() {
        const bills = upcomingBills();
        const total = Store.state.bills.reduce((a, b) => a + b.amount, 0);
        const thisMonth = new Date().toISOString().slice(0, 7);
        const paidTotal = Store.state.bills.filter(b => b.paidMonths.includes(thisMonth)).reduce((a, b) => a + b.amount, 0);
        return `
        <div class="section-head">
            <div><p class="muted">${bills.length} recurring bills · ${fmt(total)}/mo total · ${fmt(paidTotal)} paid this month</p></div>
            <button class="btn" id="addBillBtn">+ Add bill</button>
        </div>
        <div class="card">
        ${bills.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Bill</th><th>Category</th><th>Due</th><th style="text-align:right">Amount</th><th></th></tr></thead>
            <tbody>${bills.map(b => `<tr>
                <td>${esc(b.name)}${b.autopay?` <span class="muted" style="font-size:11px">· autopay</span>`:""}</td>
                <td>${catChip(b.category)}</td>
                <td><span class="due ${b.badge}">${b.dueText}</span></td>
                <td style="text-align:right">${fmt(b.amount)}</td>
                <td style="text-align:right;white-space:nowrap">
                    <button class="link-btn" data-togglebill="${b.id}">${b.paid?"Unmark":"Mark paid"}</button>
                    <button class="link-btn" data-editbill="${b.id}">Edit</button>
                    <button class="link-btn danger" data-delbill="${b.id}">×</button>
                </td>
            </tr>`).join("")}</tbody></table></div>`
        : `<div class="empty"><div class="big">🗓</div><p>No bills yet. Add recurring bills to get due-date reminders and never miss a payment.</p><button class="btn" id="addBillBtn2">Add a bill</button></div>`}
        </div>`;
    }

    /* ============================================================
       SUBSCRIPTIONS
       ============================================================ */
    function detectSubscriptions() {
        // suggest from recurring transactions not already tracked
        const merchantMap = {};
        Store.state.transactions.filter(t => t.amount < 0).forEach(t => {
            const key = t.description.replace(/\d+/g, "").trim().toLowerCase().slice(0, 28) || t.description;
            if (!merchantMap[key]) merchantMap[key] = { name: t.description, months: new Set(), amt: -t.amount, cat: t.category };
            merchantMap[key].months.add((t.date || "").slice(0, 7));
        });
        const tracked = new Set(Store.state.subscriptions.map(s => s.name.toLowerCase()));
        return Object.values(merchantMap).filter(m => m.months.size >= 2 && !tracked.has(m.name.toLowerCase()))
            .sort((a, b) => b.months.size - a.months.size).slice(0, 6);
    }
    function renderSubscriptions() {
        const subs = Store.state.subscriptions;
        const monthly = Finance.monthlySubscriptions();
        const annual = Finance.annualSubscriptions();
        const inactive = subs.filter(s => !s.active);
        const savings = inactive.reduce((a, s) => a + (s.cycle === "yearly" ? s.amount / 12 : s.amount), 0);
        const suggestions = detectSubscriptions();

        return `
        <div class="grid grid-3 mb-18">
            <div class="card stat"><span class="stat-label">Active subscriptions</span><span class="stat-value">${subs.filter(s=>s.active).length}</span><span class="stat-sub">${fmt(monthly)}/mo</span></div>
            <div class="card stat"><span class="stat-label">Annual cost</span><span class="stat-value">${fmt(annual)}</span><span class="stat-sub">across all active subs</span></div>
            <div class="card stat"><span class="stat-label">Cancelled savings</span><span class="stat-value up">${fmt(savings)}</span><span class="stat-sub">saved per month</span></div>
        </div>
        <div class="section-head"><p class="muted">Track and cancel recurring subscriptions</p><button class="btn" id="addSubBtn">+ Add subscription</button></div>
        <div class="card mb-18">
        ${subs.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Service</th><th>Category</th><th>Cycle</th><th style="text-align:right">Cost</th><th style="text-align:right">Monthly</th><th></th></tr></thead>
            <tbody>${subs.map(s => `<tr style="${s.active?"":"opacity:.55"}">
                <td>${esc(s.name)}</td><td>${catChip(s.category)}</td>
                <td class="muted">${s.cycle}</td>
                <td style="text-align:right">${fmt(s.amount)}</td>
                <td style="text-align:right">${fmt(s.cycle==="yearly"?s.amount/12:s.amount)}</td>
                <td style="text-align:right;white-space:nowrap">
                    <button class="link-btn" data-togglesub="${s.id}">${s.active?"Cancel":"Reactivate"}</button>
                    <button class="link-btn danger" data-delsub="${s.id}">×</button>
                </td>
            </tr>`).join("")}</tbody></table></div>`
        : `<div class="empty"><div class="big">🔁</div><p>No subscriptions tracked. Add them to see your total recurring spend and find things to cancel.</p><button class="btn" id="addSubBtn2">Add a subscription</button></div>`}
        </div>
        ${suggestions.length ? `<div class="card"><h3>Detected recurring charges</h3>
            <p class="muted" style="font-size:12.5px;margin-bottom:12px">These merchants appear across multiple months — they may be subscriptions.</p>
            <table class="table"><tbody>${suggestions.map(m=>`<tr>
                <td>${esc(m.name)}<br><span class="muted" style="font-size:11.5px">${m.months.size} months · ~${fmt(m.amt)}</span></td>
                <td style="text-align:right"><button class="link-btn" data-addsugsub='${encodeURIComponent(JSON.stringify({name:m.name,amount:Math.round(m.amt*100)/100,category:m.cat}))}'>+ Track</button></td>
            </tr>`).join("")}</tbody></table></div>` : ""}`;
    }

    /* ============================================================
       BUDGETS (with rollover + auto-suggest)
       ============================================================ */
    function renderBudgets() {
        const txs = Store.txForMonth(currentMonth);
        const s = summarize(txs);
        const cats = Categorize.names().filter(n => n !== "Income" && !Categorize.isNeutral(n));
        const rows = cats.map(cat => {
            const spent = s.byCat[cat] || 0;
            const roll = Finance.budgetWithRollover(cat, currentMonth || Finance.currentMonthKey());
            const limit = roll.effective;
            const hasBudget = (Store.state.budgets[cat] || 0) > 0;
            const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
            const over = limit > 0 && spent > limit;
            const color = over ? "var(--red)" : pct > 80 ? "var(--amber)" : "var(--green)";
            const rollOn = !!Store.state.budgetRollover[cat];
            return `<div class="bar-row">
                <div class="bar-head">
                    <span style="display:inline-flex;align-items:center;gap:8px">
                        <button class="cat-logo" data-catgo="${esc(cat)}" title="See ${esc(cat)} transactions" aria-label="See ${esc(cat)} transactions" style="--logo-ring:${Categorize.categoryColor(cat)}">${catIcon(cat)}</button>
                        ${catChip(cat)}${rollOn && roll.carry ? `<span class="muted" style="font-size:11px"> · ${roll.carry>=0?"+":""}${fmtShort(roll.carry)} rollover</span>`:""}</span>
                    <span class="muted">${fmt(spent)}${hasBudget?` / <span style="color:${over?'var(--red)':'var(--text)'}">${fmt(limit)}</span>`:` <button class="link-btn" data-setbudget="${cat}">set budget</button>`}</span>
                </div>
                ${hasBudget?`<div class="progress"><span style="width:${pct}%;background:${color}"></span></div>
                <div style="display:flex;justify-content:space-between;margin-top:5px;align-items:center">
                    <span class="muted" style="font-size:12px">${over?`${fmt(spent-limit)} over`:`${fmt(limit-spent)} left`}</span>
                    <span style="display:flex;gap:12px;align-items:center">
                        <label class="switch" style="font-size:11.5px"><input type="checkbox" data-rollover="${cat}" ${rollOn?"checked":""}><span class="track"></span>rollover</label>
                        <button class="link-btn" data-setbudget="${cat}">edit</button>
                    </span>
                </div>`:""}
            </div>`;
        }).join("");
        const totalBudget = Object.values(Store.state.budgets).reduce((a, b) => a + b, 0);
        const totalSpent = cats.reduce((a, c) => a + (s.byCat[c] || 0), 0);
        const usedPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
        const ringColor = usedPct >= 100 ? "var(--red)" : usedPct > 80 ? "var(--amber)" : "var(--green)";
        // YNAB-style "give every dollar a job": income not yet budgeted or reserved
        const incomeForAssign = Finance.estimatedMonthlyIncome();
        const goalReserve = Store.state.goals.length ? incomeForAssign * 0.1 : 0;
        const leftToAssign = incomeForAssign > 0 ? incomeForAssign - totalBudget - goalReserve : 0;
        const assignStrip = incomeForAssign > 0 && Math.abs(leftToAssign) >= 10 ? `
        <div class="suggest-strip" style="${leftToAssign < 0 ? "border-color:var(--red);background:color-mix(in srgb, var(--red) 6%, transparent)" : ""}">
            <span style="font-size:20px">${leftToAssign >= 0 ? "💵" : "⚠"}</span>
            <p>${leftToAssign >= 0
                ? `<strong>${fmt(leftToAssign)}</strong> of your income doesn't have a job yet. Assign it to budgets or savings so every dollar is working.`
                : `You've budgeted <strong>${fmt(-leftToAssign)}</strong> more than your income${goalReserve ? " (after the goal reserve)" : ""} — trim a bucket or two.`}</p>
            ${leftToAssign >= 0 ? `<button class="btn btn-sm" id="assignHelp">Assign with 50/30/20</button>` : ""}
        </div>` : "";
        return `
        ${assignStrip}
        <div class="grid grid-4 mb-18">
            <div class="card" style="display:flex;align-items:center;gap:16px">
                <div class="score-ring">${Charts.gauge(usedPct, 92, { color: ringColor, thickness: 11 })}
                    <div class="score-num"><strong style="font-size:20px">${totalBudget>0?usedPct.toFixed(0)+"%":"—"}</strong></div></div>
                <div><div class="stat-label">Budget used</div><div class="stat-sub">${monthLabel(currentMonth)}</div></div>
            </div>
            <div class="card stat"><span class="stat-label">Total budgeted</span><span class="stat-value">${fmt(totalBudget)}</span></div>
            <div class="card stat"><span class="stat-label">Spent</span><span class="stat-value">${fmt(totalSpent)}</span></div>
            <div class="card stat"><span class="stat-label">Remaining</span><span class="stat-value ${totalBudget-totalSpent>=0?"up":"down"}">${fmtSigned(totalBudget-totalSpent)}</span></div>
        </div>
        <div class="card">
            <div class="card-title-row"><h3>Monthly budgets by bucket — ${monthLabel(currentMonth)}</h3>
                <div class="row-actions">
                    <button class="btn btn-sm btn-ghost" id="templateBudget">50/30/20 template</button>
                    <button class="btn btn-sm btn-ghost" id="autoBudget">Auto-suggest from spending</button>
                </div></div>
            <p class="muted" style="font-size:12px;margin-bottom:16px">Turn on <strong>rollover</strong> (envelope-style) to carry unused budget — or overspend — into the next month, like YNAB.</p>
            ${rows}
        </div>`;
    }

    /* ============================================================
       GOALS
       ============================================================ */
    function renderGoals() {
        const goals = Store.state.goals;
        const st = Store.state.settings;
        const acc = Finance.roundupAccrued();
        const targetGoal = goals.find(g => g.id === st.roundupGoalId);
        const goalOpts = goals.map(g => `<option value="${g.id}" ${g.id===st.roundupGoalId?"selected":""}>${esc(g.name)}</option>`).join("");
        const jar = `
        <div class="card mb-18" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
            <div style="font-size:30px">🪙</div>
            <div style="flex:1;min-width:220px">
                <h3 style="margin-bottom:2px">Round-up jar</h3>
                <p class="muted" style="font-size:12.5px">${st.roundupEnabled
                    ? `${fmt(acc.total)} of spare change from ${acc.count} purchases${acc.since ? ` since ${acc.since}` : ""} — each expense rounded up to the next whole ${esc(CUR())}.`
                    : `Round every expense up to the next whole ${esc(CUR())} and sweep the spare change into a goal.`}</p>
            </div>
            ${st.roundupEnabled ? `
                ${goals.length ? `<select class="cat-select" id="roundupGoal" style="padding:8px 10px">${goalOpts}</select>` : `<span class="muted" style="font-size:12.5px">Create a goal to sweep into</span>`}
                <button class="btn" id="sweepRoundup" ${(!targetGoal || acc.total <= 0) ? "disabled style='opacity:.5'" : ""}>Sweep ${fmt(acc.total)}</button>
                <button class="btn btn-ghost btn-sm" id="roundupOff">Turn off</button>`
            : `<button class="btn" id="roundupOn">Enable round-ups</button>`}
        </div>`;
        // auto-fund suggestion: put part of this month's surplus toward the most urgent goal
        let suggest = "";
        const sts = Finance.safeToSpend(activeMonth());
        const openGoals = goals.filter(g => g.saved < g.target);
        if (sts.safe > 50 && openGoals.length) {
            const urgent = openGoals.slice().sort((a, b) => {
                if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
                if (a.deadline) return -1; if (b.deadline) return 1;
                return (a.saved / a.target) - (b.saved / b.target);
            })[0];
            const amount = Math.max(10, Math.floor(Math.min(sts.safe * 0.5, urgent.target - urgent.saved) / 10) * 10);
            suggest = `<div class="suggest-strip">
                <span style="font-size:20px">💡</span>
                <p>You have about <strong>${fmt(sts.safe)}</strong> safe to spend this month. Put <strong>${fmt(amount)}</strong> toward <strong>${esc(urgent.name)}</strong>${urgent.deadline?` (due ${urgent.deadline})`:""}?</p>
                <button class="btn btn-sm" id="fundSuggest" data-goal="${urgent.id}" data-amt="${amount}">Fund ${fmt(amount)}</button>
            </div>`;
        }
        return `
        <div class="section-head"><p class="muted">${goals.length} saving goal${goals.length===1?"":"s"}</p><button class="btn" id="addGoalBtn">+ New goal</button></div>
        ${jar}
        ${suggest}
        ${goals.length === 0 ? `<div class="card"><div class="empty"><div class="big">◎</div><p>No saving goals yet. Create one to start tracking progress.</p><button class="btn" id="addGoalBtn2">Create a goal</button></div></div>` : `
        <div class="grid grid-2">${goals.map(g => {
            const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const remaining = Math.max(0, g.target - g.saved);
            const done = g.target > 0 && g.saved >= g.target;
            let etaTxt = "";
            if (g.deadline && !done) { const days = Math.ceil((new Date(g.deadline) - new Date()) / 86400000);
                etaTxt = days > 0 ? `${days} days left` : "Past deadline";
                if (days > 0 && remaining > 0) { const perMonth = remaining / Math.max(1, days / 30); etaTxt += ` · ${fmtShort(perMonth)}/mo needed`; } }
            const nextMs = [25, 50, 75, 100].find(msv => pct < msv);
            const msTxt = done ? "" : (nextMs ? ` · next milestone ${nextMs}% (${fmt(g.target * nextMs / 100 - g.saved)} away)` : "");
            return `<div class="card ${done ? "goal-done" : ""}">
                <div class="card-title-row"><h3>${esc(g.name)}</h3>${done ? `<span class="goal-done-badge">🎉 Complete</span>` : `<span class="muted" style="font-size:12.5px">${etaTxt}</span>`}</div>
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span style="font-size:22px;font-weight:700">${fmt(g.saved)}</span><span class="muted">of ${fmt(g.target)}</span></div>
                <div class="progress"><span style="width:${pct}%;background:${done ? "var(--green)" : "linear-gradient(90deg,var(--accent),var(--accent-2))"}"></span>
                    ${[25, 50, 75].map(msv => `<i class="tick" style="left:${msv}%"></i>`).join("")}</div>
                <div style="display:flex;justify-content:space-between;margin-top:8px">
                    <span class="muted" style="font-size:12.5px">${pct.toFixed(0)}%${done ? " · funded!" : ` · ${fmt(remaining)} to go${msTxt}`}</span>
                    <div class="row-actions">
                        <button class="link-btn" data-contribute="${g.id}">+ Add funds</button>
                        <button class="link-btn" data-editgoal="${g.id}">Edit</button>
                        <button class="link-btn danger" data-delgoal="${g.id}">Delete</button>
                    </div>
                </div>
            </div>`; }).join("")}</div>`}`;
    }

    /* ============================================================
       HABITS
       ============================================================ */
    function renderHabits() {
        const all = Store.state.transactions;
        if (!all.length) return `<div class="empty"><div class="big">∿</div><p>Import transactions to analyze your spending habits.</p></div>`;
        const s = summarize(Store.txForMonth(currentMonth));
        const breakdown = catBreakdown(s.byCat);
        const series = monthlySeries(6);

        const merchantMap = {};
        all.filter(t => t.amount < 0).forEach(t => {
            const key = t.description.replace(/\d+/g, "").trim().toLowerCase().slice(0, 28) || t.description;
            if (!merchantMap[key]) merchantMap[key] = { name: t.description, count: 0, total: 0, months: new Set() };
            merchantMap[key].count++; merchantMap[key].total += -t.amount; merchantMap[key].months.add((t.date || "").slice(0, 7));
        });
        const recurring = Object.values(merchantMap).filter(m => m.count >= 3 || m.months.size >= 2).sort((a, b) => b.total - a.total).slice(0, 6);
        const biggest = Store.txForMonth(currentMonth).filter(t => t.amount < 0).sort((a, b) => a.amount - b.amount).slice(0, 5);
        const days = new Set(Store.txForMonth(currentMonth).map(t => t.date)).size || 1;
        const avgDaily = s.expense / days;

        let trendTxt = "", trendClass = "muted";
        if (series.length >= 2) {
            const cur = series[series.length - 1].expense, prev = series[series.length - 2].expense;
            if (prev > 0) { const diff = ((cur - prev) / prev) * 100; trendClass = diff > 0 ? "down" : "up";
                trendTxt = `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(0)}% vs previous month`; }
        }
        return `
        <div class="grid grid-3 mb-18">
            <div class="card stat"><span class="stat-label">Avg. daily spend</span><span class="stat-value">${fmt(avgDaily)}</span><span class="stat-sub">${monthLabel(currentMonth)}</span></div>
            <div class="card stat"><span class="stat-label">Top category</span><span class="stat-value" style="font-size:22px">${breakdown[0]?esc(breakdown[0].label):"—"}</span><span class="stat-sub">${breakdown[0]?fmt(breakdown[0].value):""}</span></div>
            <div class="card stat"><span class="stat-label">Monthly trend</span><span class="stat-value ${trendClass}" style="font-size:20px">${trendTxt||"—"}</span><span class="stat-sub">expenses</span></div>
        </div>
        <div class="grid grid-2 mb-18">
            <div class="card"><h3>Recurring &amp; subscriptions</h3>
                ${recurring.length ? `<table class="table"><tbody>${recurring.map(m => `<tr><td>${esc(m.name)}</td><td class="muted" style="text-align:right">${m.count}× · ${fmt(m.total)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No recurring patterns detected yet.</p>`}</div>
            <div class="card"><h3>Biggest expenses — ${monthLabel(currentMonth)}</h3>
                ${biggest.length ? `<table class="table"><tbody>${biggest.map(t => `<tr><td>${esc(t.description)}<br><span class="muted" style="font-size:11.5px">${esc(t.date)} · ${esc(t.category)}</span></td><td class="amount-neg" style="text-align:right">${fmt(t.amount)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No expenses this period.</p>`}</div>
        </div>
        <div class="grid grid-2">
            <div class="card">
                <h3>Daily spending — ${monthLabel(activeMonth())}</h3>
                ${(() => {
                    const dayTotals = {};
                    Store.txForMonth(activeMonth()).forEach(t => {
                        if (t.amount >= 0 || Categorize.isNeutral(t.category)) return;
                        const d = Number((t.date || "").slice(8, 10));
                        if (d) dayTotals[d] = (dayTotals[d] || 0) + (-t.amount);
                    });
                    const days = Object.entries(dayTotals);
                    const busiest = days.sort((a, b) => b[1] - a[1])[0];
                    return Charts.heatmap(activeMonth(), dayTotals, { fmt }) +
                        (busiest ? `<p class="muted" style="font-size:12px;margin-top:8px">Biggest day: ${activeMonth()}-${String(busiest[0]).padStart(2, "0")} · ${fmt(busiest[1])}</p>` : "");
                })()}
            </div>
            <div class="card"><h3>Monthly expense trend</h3>${Charts.bars(series.map(m => ({ label: m.label, value: m.expense })), { fmt: fmtShort })}</div>
        </div>`;
    }

    /* ============================================================
       HEALTH (unchanged scoring, plus net-worth aware)
       ============================================================ */
    function computeHealth() {
        const all = Store.state.transactions;
        const series = monthlySeries(3);
        const recentMonth = Store.availableMonths()[0] || null;
        const s = summarize(recentMonth ? Store.txForMonth(recentMonth) : all);
        const metrics = [];

        let savingsPts, savingsStatus, savingsDesc;
        if (s.income <= 0) { savingsPts = 12; savingsStatus = "warn"; savingsDesc = "No income recorded this period."; }
        else if (s.savingsRate >= 20) { savingsPts = 30; savingsStatus = "good"; savingsDesc = `Saving ${s.savingsRate.toFixed(0)}% of income — excellent.`; }
        else if (s.savingsRate >= 10) { savingsPts = 22; savingsStatus = "warn"; savingsDesc = `Saving ${s.savingsRate.toFixed(0)}% — aim for 20%.`; }
        else if (s.savingsRate >= 0) { savingsPts = 12; savingsStatus = "warn"; savingsDesc = `Only ${s.savingsRate.toFixed(0)}% saved this period.`; }
        else { savingsPts = 3; savingsStatus = "bad"; savingsDesc = `Spending exceeds income by ${fmt(-s.net)}.`; }
        metrics.push({ title: "Savings rate", desc: savingsDesc, status: savingsStatus, ico: "%" });

        const budgets = Store.state.budgets, budgetCats = Object.keys(budgets);
        let budgetPts, budgetStatus, budgetDesc;
        if (budgetCats.length === 0) { budgetPts = 12; budgetStatus = "warn"; budgetDesc = "No budgets set — add budgets to track adherence."; }
        else { const over = budgetCats.filter(c => (s.byCat[c] || 0) > budgets[c]); const ratio = 1 - over.length / budgetCats.length;
            budgetPts = Math.round(ratio * 20); budgetStatus = over.length === 0 ? "good" : over.length <= budgetCats.length / 2 ? "warn" : "bad";
            budgetDesc = over.length === 0 ? "All budgets on track." : `${over.length} of ${budgetCats.length} budgets exceeded.`; }
        metrics.push({ title: "Budget adherence", desc: budgetDesc, status: budgetStatus, ico: "◑" });

        let trendPts = 10, trendStatus = "warn", trendDesc = "Not enough history to assess trend.";
        if (series.length >= 2) { const cur = series[series.length - 1].expense, prev = series[series.length - 2].expense;
            if (prev > 0) { const diff = ((cur - prev) / prev) * 100;
                if (diff <= 0) { trendPts = 15; trendStatus = "good"; trendDesc = `Spending down ${Math.abs(diff).toFixed(0)}% month-over-month.`; }
                else if (diff < 15) { trendPts = 10; trendStatus = "warn"; trendDesc = `Spending up ${diff.toFixed(0)}% — keep an eye on it.`; }
                else { trendPts = 4; trendStatus = "bad"; trendDesc = `Spending jumped ${diff.toFixed(0)}% vs last month.`; } } }
        metrics.push({ title: "Spending trend", desc: trendDesc, status: trendStatus, ico: "∿" });

        const goals = Store.state.goals;
        let goalPts, goalStatus, goalDesc;
        if (goals.length === 0) { goalPts = 5; goalStatus = "warn"; goalDesc = "No saving goals — set one for a safety net."; }
        else { const avgPct = goals.reduce((a, g) => a + (g.target > 0 ? Math.min(1, g.saved / g.target) : 0), 0) / goals.length;
            goalPts = Math.round(avgPct * 15); goalStatus = avgPct >= 0.66 ? "good" : avgPct >= 0.33 ? "warn" : "bad";
            goalDesc = `Goals ${(avgPct * 100).toFixed(0)}% funded on average.`; }
        metrics.push({ title: "Goal progress", desc: goalDesc, status: goalStatus, ico: "◎" });

        // Net worth / debt metric (20)
        const nw = Finance.netWorth();
        let nwPts, nwStatus, nwDesc;
        if (Store.state.accounts.length === 0) { nwPts = 10; nwStatus = "warn"; nwDesc = "Add accounts to track net worth and debt."; }
        else if (nw.total > 0 && nw.liabilities <= nw.assets * 0.4) { nwPts = 20; nwStatus = "good"; nwDesc = `Positive net worth of ${fmtShort(nw.total)} with manageable debt.`; }
        else if (nw.total > 0) { nwPts = 13; nwStatus = "warn"; nwDesc = `Net worth ${fmtShort(nw.total)}, but debt is a large share of assets.`; }
        else { nwPts = 4; nwStatus = "bad"; nwDesc = `Debt exceeds assets by ${fmtShort(-nw.total)}.`; }
        metrics.push({ title: "Net worth & debt", desc: nwDesc, status: nwStatus, ico: "◈" });

        const score = Math.max(0, Math.min(100, savingsPts + budgetPts + trendPts + goalPts + nwPts));
        return { score, metrics };
    }
    function renderHealth() {
        if (!Store.state.transactions.length && !Store.state.accounts.length) return `<div class="empty"><div class="big">♥</div><p>Import transactions to run a financial health check.</p></div>`;
        const h = computeHealth();
        const label = h.score >= 75 ? "Healthy" : h.score >= 50 ? "Fair" : "Needs attention";
        const labelColor = h.score >= 75 ? "var(--green)" : h.score >= 50 ? "var(--amber)" : "var(--red)";
        return `
        <div class="grid grid-2">
            <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
                <div class="score-ring">${Charts.gauge(h.score)}<div class="score-num"><strong>${h.score}</strong><small>out of 100</small></div></div>
                <div style="text-align:center"><div style="font-size:18px;font-weight:700;color:${labelColor}">${label}</div>
                    <p class="muted" style="font-size:13px;max-width:280px;margin-top:4px">Your overall financial health, based on savings, budgeting, spending trends, goals and net worth.</p></div>
            </div>
            <div class="card"><h3>Score breakdown</h3><div class="metric-list">
                ${h.metrics.map(m => { const bg = m.status === "good" ? "rgba(63,185,80,.15)" : m.status === "warn" ? "rgba(210,153,34,.15)" : "rgba(248,81,73,.15)";
                    const fg = m.status === "good" ? "var(--green)" : m.status === "warn" ? "var(--amber)" : "var(--red)";
                    const badge = m.status === "good" ? "good" : m.status === "warn" ? "warn" : "bad";
                    const badgeTxt = m.status === "good" ? "Good" : m.status === "warn" ? "Watch" : "Action";
                    return `<div class="metric"><div class="m-ico" style="background:${bg};color:${fg}">${m.ico}</div>
                        <div class="m-body" style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><h4>${m.title}</h4><span class="badge ${badge}">${badgeTxt}</span></div><p>${m.desc}</p></div></div>`; }).join("")}
            </div></div>
        </div>`;
    }

    /* ============================================================
       ADVICE
       ============================================================ */
    function buildAdvice() {
        const tips = [];
        const recentMonth = Store.availableMonths()[0] || null;
        const s = summarize(recentMonth ? Store.txForMonth(recentMonth) : Store.state.transactions);
        const budgets = Store.state.budgets, goals = Store.state.goals, bd = catBreakdown(s.byCat);
        const nw = Finance.netWorth(), subs = Finance.monthlySubscriptions(), annualSubs = Finance.annualSubscriptions();

        if (s.net < 0) tips.push({ type: "priority", ico: "⚠", title: "You're spending more than you earn", body: `This period you're negative by ${fmt(-s.net)}. Identify one or two categories to cut back on and pause non-essential purchases until you're back in the black.` });
        if (nw.total < 0) tips.push({ type: "priority", ico: "◈", title: "Debt exceeds your assets", body: `Your liabilities are ${fmtShort(-nw.total)} more than your assets. Prioritize high-interest debt — check the payoff plan on the Net Worth tab.` });
        if (s.income > 0 && s.savingsRate < 20 && s.net >= 0) tips.push({ type: "", ico: "%", title: "Aim for a 20% savings rate", body: `You're saving ${s.savingsRate.toFixed(0)}% of income. Automating a transfer on payday — "pay yourself first" — makes the target easier to hit.` });
        if (s.savingsRate >= 20) tips.push({ type: "positive", ico: "✓", title: "Great savings discipline", body: `You're saving ${s.savingsRate.toFixed(0)}% of income — above the recommended 20%. Consider putting the surplus into an index fund or high-yield account.` });
        if (annualSubs > 0) tips.push({ type: "", ico: "🔁", title: "Your subscriptions add up", body: `Active subscriptions cost about ${fmt(subs)}/mo — ${fmt(annualSubs)} a year. Review the Subscriptions tab and cancel anything you don't use.` });
        const discretionary = ["Dining", "Shopping", "Entertainment"].reduce((a, c) => a + (s.byCat[c] || 0), 0);
        if (s.expense > 0 && discretionary / s.expense > 0.4) tips.push({ type: "", ico: "🍽", title: "Discretionary spending is high", body: `Dining, shopping and entertainment are ${((discretionary/s.expense)*100).toFixed(0)}% of spending. Try a "48-hour rule" — wait two days before non-essential buys.` });
        if (bd.length && bd[0].value / (s.expense || 1) > 0.35) tips.push({ type: "", ico: "◑", title: `${bd[0].label} dominates your spending`, body: `${bd[0].label} is ${((bd[0].value/s.expense)*100).toFixed(0)}% of expenses (${fmt(bd[0].value)}). Setting a budget for it can help keep it in check.` });
        if (Object.keys(budgets).length === 0) tips.push({ type: "", ico: "◑", title: "Set up budgets", body: "Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings — then set a monthly limit per bucket." });
        if (goals.length === 0) tips.push({ type: "", ico: "◎", title: "Build an emergency fund", body: "Aim for 3–6 months of essential expenses in an accessible account. Create a saving goal to track progress toward this safety net." });

        const wellbeing = [
            { ico: "🧘", title: "Money and mind", body: "Financial stress is common — checking your finances on a fixed schedule (rather than constantly) reduces anxiety while keeping you in control." },
            { ico: "🎯", title: "Focus on what you control", body: "You can't control markets or prices, but you can control your savings rate and habits. Small, consistent actions compound." },
            { ico: "🌱", title: "Celebrate small wins", body: "Hitting a mini-goal builds motivation. Break large goals into monthly milestones and acknowledge each step." },
            { ico: "💬", title: "Talk about money", body: "Money is often taboo, which keeps stress hidden. Talking openly with a partner, friend or advisor normalizes it and surfaces solutions." }
        ];
        return { tips, wellbeing };
    }
    function renderAdvice() {
        const { tips, wellbeing } = buildAdvice();
        const hasData = Store.state.transactions.length > 0;
        return `
        <div class="grid grid-2">
            <div><h3 style="margin-bottom:14px">Personalized advice</h3>
                ${hasData ? tips.map(t => `<div class="tip ${t.type}"><div class="tip-ico">${t.ico}</div><div><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div></div>`).join("") : `<p class="muted">Import your transactions to get personalized, data-driven advice.</p>`}</div>
            <div><h3 style="margin-bottom:14px">Financial wellbeing</h3>
                ${wellbeing.map(t => `<div class="tip"><div class="tip-ico">${t.ico}</div><div><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div></div>`).join("")}</div>
        </div>`;
    }

    /* ============================================================
       SETTINGS
       ============================================================ */
    function renderSettings() {
        const st = Store.state.settings;
        const custom = Store.state.customCategories;
        const currencies = ["$", "€", "£", "¥", "₹", "A$", "C$", "R$"];
        return `
        <div class="grid grid-2">
            <div>
                <div class="card mb-18">
                    <h3>Preferences</h3>
                    <div class="form-row"><label>Currency symbol</label><select id="setCurrency">${currencies.map(c=>`<option ${c===st.currency?"selected":""}>${c}</option>`).join("")}</select></div>
                    <div class="form-row"><label>Estimated monthly income (used for Safe-to-Spend)</label><input id="setIncome" type="number" value="${st.monthlyIncome||""}" placeholder="Leave blank to auto-detect"></div>
                    <button class="btn" id="saveSettings">Save preferences</button>
                </div>
                <div class="card">
                    <h3>Custom categories</h3>
                    <p class="muted" style="font-size:12.5px;margin-bottom:12px">Add your own spending buckets with keywords for auto-categorization.</p>
                    <div id="customCatList">${custom.length?custom.map(c=>`<div class="acct-row"><span class="dot" style="width:12px;height:12px;border-radius:3px;background:${c.color}"></span><div><div class="acct-name">${esc(c.name)}</div><div class="acct-type">${c.kw.length?esc(c.kw.join(", ")):"no keywords"}</div></div><button class="link-btn danger" data-delcat="${esc(c.name)}" style="margin-left:auto">Remove</button></div>`).join(""):`<p class="muted" style="font-size:12.5px">No custom categories yet.</p>`}</div>
                    <button class="btn btn-ghost btn-sm mt-18" id="addCatBtn">+ Add category</button>
                </div>
                <div class="card mt-18">
                    <h3>Household</h3>
                    <p class="muted" style="font-size:12.5px;margin-bottom:12px">Add the people you share finances with, then assign transactions to see who spends what.</p>
                    <div>${Store.state.members.length ? Store.state.members.map(m => `<div class="acct-row">
                        <span class="member-chip">${esc(m.name.slice(0,2).toUpperCase())}</span>
                        <div class="acct-name">${esc(m.name)}</div>
                        <button class="link-btn danger" data-delmember="${m.id}" style="margin-left:auto">Remove</button>
                    </div>`).join("") : `<p class="muted" style="font-size:12.5px">No members yet — it's just you.</p>`}</div>
                    <div class="row-actions mt-18">
                        <input class="search-input" id="memberName" placeholder="Name, e.g. Priya" style="flex:1">
                        <button class="btn btn-ghost btn-sm" id="addMemberBtn">+ Add member</button>
                    </div>
                </div>
            </div>
            <div>
                <div class="card mb-18">
                    <h3>Privacy &amp; security</h3>
                    <p class="muted" style="font-size:12.5px;margin-bottom:12px">All data stays on this device — the app makes no network requests with your finances, enforced by a strict content-security policy. With app lock on, everything is also <strong>encrypted at rest</strong> (AES-256-GCM, key derived from your PIN) — unreadable without the PIN, even with full access to this device.</p>
                    ${Store.state.settings.pinHash
                        ? `<div class="row-actions">
                            <span class="badge good">🔒 Locked & encrypted</span>
                            <button class="btn btn-ghost btn-sm" id="changePin">Change PIN</button>
                            <button class="btn btn-ghost btn-sm" id="lockNow">Lock now</button>
                            <button class="btn btn-ghost btn-sm danger" id="disablePin">Turn off</button>
                        </div>`
                        : `<button class="btn" id="setPin">🔒 Set app lock PIN</button>`}
                </div>
                <div class="card mb-18">
                    <h3>Backup &amp; restore</h3>
                    <p class="muted" style="font-size:12.5px;margin-bottom:14px">Your data lives only in this browser. Export a backup file to keep it safe or move to another device.</p>
                    <div class="row-actions" style="flex-wrap:wrap">
                        <button class="btn" id="exportData">Export backup (.json)</button>
                        <button class="btn btn-ghost" id="importData">Import backup</button>
                        <button class="btn btn-ghost" id="exportCsvBtn2">Export CSV</button>
                        <input type="file" id="importFile" accept="application/json,.json" hidden>
                    </div>
                </div>
                <div class="card mb-18">
                    <h3>Install app</h3>
                    <p class="muted" style="font-size:12.5px;margin-bottom:14px">Fintrack is a Progressive Web App — install it to your home screen for an app-like, offline experience.</p>
                    <button class="btn" id="installBtn">Install Fintrack</button>
                    <p class="muted" style="font-size:12px;margin-top:10px" id="installHint">On iPhone: Share → Add to Home Screen. On Android/desktop Chrome: use the install icon in the address bar.</p>
                </div>
                <div class="card">
                    <h3>Danger zone</h3>
                    <p class="muted" style="font-size:12.5px;margin-bottom:14px">Permanently delete all transactions, accounts, bills, budgets and goals stored in this browser.</p>
                    <button class="btn" style="background:var(--red)" id="resetData">Reset all data</button>
                </div>
            </div>
        </div>`;
    }

    /* ============================================================
       ROUTER
       ============================================================ */
    const VIEWS = {
        dashboard: { title: "Dashboard", render: renderDashboard },
        networth: { title: "Net Worth", render: renderNetWorth },
        reports: { title: "Reports & Insights", render: renderReports },
        transactions: { title: "Transactions", render: renderTransactions },
        upload: { title: "Import Statement", render: renderUpload },
        bills: { title: "Bills & Reminders", render: renderBills },
        subscriptions: { title: "Subscriptions", render: renderSubscriptions },
        budgets: { title: "Budgets", render: renderBudgets },
        goals: { title: "Saving Goals", render: renderGoals },
        habits: { title: "Spending Habits", render: renderHabits },
        health: { title: "Health Check", render: renderHealth },
        advice: { title: "Advice & Wellbeing", render: renderAdvice },
        settings: { title: "Settings", render: renderSettings }
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
    const MORE_VIEWS = ["goals", "networth", "reports", "bills", "upload", "habits", "health", "advice", "settings"];
    function goTo(view) {
        activeView = view;
        $$(".nav-item, .bnav-item[data-view], .sheet-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
        // "More" tab lights up when any sheet view is active
        const moreBtn = $("#moreNavBtn");
        if (moreBtn) moreBtn.classList.toggle("active", MORE_VIEWS.includes(view));
        closeSheet();
        window.scrollTo({ top: 0 });
        renderActive();
    }

    /* ---------- global nav ---------- */
    $$(".nav-item[data-view], .bnav-item[data-view], .sheet-item[data-view]").forEach(btn =>
        btn.addEventListener("click", () => goTo(btn.dataset.view)));
    const menuToggle = $("#menuToggle");
    if (menuToggle) menuToggle.addEventListener("click", () => $("#sidebar").classList.toggle("open"));

    /* ---------- mobile: more sheet + FAB ---------- */
    function openSheet() { $("#sheetBackdrop").hidden = false; }
    function closeSheet() { const s = $("#sheetBackdrop"); if (s) s.hidden = true; }
    $("#moreNavBtn").addEventListener("click", openSheet);
    $("#sheetBackdrop").addEventListener("click", e => { if (e.target.id === "sheetBackdrop") closeSheet(); });
    $("#fabAdd").addEventListener("click", () => openAddTx());
    $("#themeToggle").addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("fintrack.theme", next); } catch (e) {}
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", next === "light" ? "#f9f9f7" : "#0d0d0d");
        renderActive(); // re-render so inline-SVG charts pick up themed colors
    });
    const monthInput = $("#monthFilter");
    monthInput.addEventListener("change", () => { currentMonth = monthInput.value || null; renderActive(); });

    /* ---------- per-view event wiring ---------- */
    function wireViewEvents() {
        $$("[data-goto]").forEach(b => b.addEventListener("click", () => goTo(b.dataset.goto)));
        bindClick("#customizeDash", openCustomizeDash);

        // transactions
        bindClick("#addTxBtn", openAddTx);
        bindClick("#exportCsvBtn", exportCSV);
        $$("[data-recat]").forEach(sel => sel.addEventListener("change", e => { Store.updateTransaction(sel.dataset.recat, { category: e.target.value }); toast("Category updated", "success"); }));
        $$("[data-edittx]").forEach(b => b.addEventListener("click", () => openEditTx(b.dataset.edittx)));
        $$("[data-splittx]").forEach(b => b.addEventListener("click", () => openSplitTx(b.dataset.splittx)));
        $$("[data-deltx]").forEach(b => b.addEventListener("click", () => { Store.deleteTransaction(b.dataset.deltx); toast("Transaction deleted"); renderActive(); }));
        const ts = $("#txSearch"); if (ts) ts.addEventListener("input", debounce(e => { txSearch = e.target.value; const pos = e.target.selectionStart; renderActive(); const n = $("#txSearch"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250));
        const tcf = $("#txCatFilter"); if (tcf) tcf.addEventListener("change", e => { txCatFilter = e.target.value; renderActive(); });
        const ttf = $("#txTagFilter"); if (ttf) ttf.addEventListener("change", e => { txTagFilter = e.target.value; renderActive(); });
        $$("[data-tagclick]").forEach(el => el.addEventListener("click", () => { txTagFilter = el.dataset.tagclick; renderActive(); }));

        // upload
        const dz = $("#dropzone"), fi = $("#fileInput");
        if (dz) {
            dz.addEventListener("click", () => fi.click());
            dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag"); });
            dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
            dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("drag"); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
            fi.addEventListener("change", () => { if (fi.files[0]) handleFile(fi.files[0]); });
        }
        bindClick("#parsePaste", () => { const text = $("#pasteArea").value; if (!text.trim()) return toast("Paste some CSV text first", "error"); ingestStatement(text); });

        // net worth
        bindClick("#addAcctBtn", () => openAccountModal()); bindClick("#addAcctBtn2", () => openAccountModal());
        $$("[data-editacct]").forEach(b => b.addEventListener("click", () => openAccountModal(b.dataset.editacct)));
        $$("[data-delacct]").forEach(b => b.addEventListener("click", () => { Store.deleteAccount(b.dataset.delacct); toast("Account removed"); renderActive(); }));
        bindClick("#snapNow", () => { Store.snapshotNetWorth(Finance.netWorth().total); toast("Snapshot saved", "success"); renderActive(); });

        // bills
        bindClick("#addBillBtn", () => openBillModal()); bindClick("#addBillBtn2", () => openBillModal());
        $$("[data-editbill]").forEach(b => b.addEventListener("click", () => openBillModal(b.dataset.editbill)));
        $$("[data-delbill]").forEach(b => b.addEventListener("click", () => { Store.deleteBill(b.dataset.delbill); toast("Bill removed"); renderActive(); }));
        $$("[data-togglebill]").forEach(b => b.addEventListener("click", () => { Store.toggleBillPaid(b.dataset.togglebill, new Date().toISOString().slice(0,7)); renderActive(); }));

        // subscriptions
        bindClick("#addSubBtn", () => openSubModal()); bindClick("#addSubBtn2", () => openSubModal());
        $$("[data-togglesub]").forEach(b => b.addEventListener("click", () => { const s = Store.state.subscriptions.find(x=>x.id===b.dataset.togglesub); Store.updateSubscription(b.dataset.togglesub, { active: !s.active }); toast(s.active?"Subscription cancelled":"Reactivated", "success"); renderActive(); }));
        $$("[data-delsub]").forEach(b => b.addEventListener("click", () => { Store.deleteSubscription(b.dataset.delsub); toast("Removed"); renderActive(); }));
        $$("[data-addsugsub]").forEach(b => b.addEventListener("click", () => { const d = JSON.parse(decodeURIComponent(b.dataset.addsugsub)); Store.addSubscription({ ...d, cycle: "monthly" }); toast("Now tracking subscription", "success"); renderActive(); }));

        // budgets
        $$("[data-setbudget]").forEach(b => b.addEventListener("click", () => openSetBudget(b.dataset.setbudget)));
        $$("[data-rollover]").forEach(cb => cb.addEventListener("change", e => { Store.setRollover(cb.dataset.rollover, e.target.checked); renderActive(); }));
        bindClick("#autoBudget", autoSuggestBudgets);
        bindClick("#templateBudget", applyTemplate503020);
        bindClick("#assignHelp", applyTemplate503020);
        $$("[data-catgo]").forEach(b => b.addEventListener("click", () => {
            txCatFilter = b.dataset.catgo; txSearch = ""; txTagFilter = "";
            goTo("transactions");
        }));

        // goals
        bindClick("#addGoalBtn", () => openGoalModal()); bindClick("#addGoalBtn2", () => openGoalModal());
        $$("[data-editgoal]").forEach(b => b.addEventListener("click", () => openGoalModal(b.dataset.editgoal)));
        $$("[data-delgoal]").forEach(b => b.addEventListener("click", () => { Store.deleteGoal(b.dataset.delgoal); toast("Goal deleted"); renderActive(); }));
        $$("[data-contribute]").forEach(b => b.addEventListener("click", () => openContribute(b.dataset.contribute)));
        bindClick("#roundupOn", () => {
            const goals = Store.state.goals;
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            Store.updateSettings({ roundupEnabled: true, roundupGoalId: Store.state.settings.roundupGoalId || (goals[0] && goals[0].id) || null,
                roundupLastSweep: Store.state.settings.roundupLastSweep || yesterday });
            toast("Round-ups enabled — spare change accrues from today", "success"); renderActive();
        });
        bindClick("#roundupOff", () => { Store.updateSettings({ roundupEnabled: false }); renderActive(); });
        const rg = $("#roundupGoal"); if (rg) rg.addEventListener("change", e => { Store.updateSettings({ roundupGoalId: e.target.value }); renderActive(); });
        bindClick("#sweepRoundup", () => {
            const st = Store.state.settings;
            const acc = Finance.roundupAccrued();
            const g = Store.state.goals.find(x => x.id === st.roundupGoalId);
            if (!g || acc.total <= 0) return;
            contributeToGoal(g.id, acc.total, `Swept ${fmt(acc.total)} into ${g.name}`);
            Store.updateSettings({ roundupLastSweep: new Date().toISOString().slice(0, 10) });
            renderActive();
        });
        const fs = $("#fundSuggest");
        if (fs) fs.addEventListener("click", () => {
            contributeToGoal(fs.dataset.goal, Number(fs.dataset.amt), `Added ${fmt(Number(fs.dataset.amt))} from this month's surplus`);
            renderActive();
        });

        // settings
        bindClick("#saveSettings", () => { Store.updateSettings({ currency: $("#setCurrency").value, monthlyIncome: Number($("#setIncome").value) || 0 }); toast("Preferences saved", "success"); renderActive(); });
        bindClick("#addCatBtn", openCategoryModal);
        $$("[data-delcat]").forEach(b => b.addEventListener("click", () => { Store.deleteCategory(b.dataset.delcat); toast("Category removed"); renderActive(); }));
        bindClick("#exportData", exportData);
        bindClick("#exportCsvBtn2", exportCSV);
        bindClick("#importData", () => $("#importFile").click());
        const imf = $("#importFile"); if (imf) imf.addEventListener("change", () => { if (imf.files[0]) importData(imf.files[0]); });
        bindClick("#installBtn", triggerInstall);
        bindClick("#resetData", confirmReset);
        bindClick("#setPin", () => openSetPin(false));
        bindClick("#changePin", () => openSetPin(true));
        bindClick("#disablePin", openDisablePin);
        bindClick("#lockNow", showLockScreen);
        bindClick("#addMemberBtn", () => {
            const name = ($("#memberName") || {}).value || "";
            if (!name.trim()) return toast("Enter a name", "error");
            if (Store.addMember(name)) { toast("Member added", "success"); renderActive(); }
            else toast("That name already exists", "error");
        });
        $$("[data-delmember]").forEach(b => b.addEventListener("click", () => {
            Store.deleteMember(b.dataset.delmember); toast("Member removed"); renderActive();
        }));
    }
    function bindClick(sel, fn) { const el = $(sel); if (el) el.addEventListener("click", fn); }
    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

    /* ---------- statement ingestion ---------- */
    function handleFile(file) { const r = new FileReader(); r.onload = e => ingestStatement(e.target.result); r.onerror = () => toast("Could not read file", "error"); r.readAsText(file); }
    function txKey(t) { return `${t.date}|${(t.description || "").trim().toLowerCase()}|${Number(t.amount).toFixed(2)}`; }

    // Auto-mark bills paid when a matching expense exists in that month:
    // amount within max($1, 2.5%) and a significant word of the bill name
    // appearing in the transaction description (or vice versa).
    function autoMatchBills(months) {
        const bills = Store.state.bills;
        if (!bills.length || !months.length) return 0;
        const words = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
        let matched = 0;
        months.forEach(m => {
            const txs = Store.txForMonth(m).filter(t => t.amount < 0);
            bills.forEach(b => {
                if (b.paidMonths.includes(m)) return;
                const tol = Math.max(1, b.amount * 0.025);
                const bw = words(b.name);
                const hit = txs.find(t => {
                    if (Math.abs(-t.amount - b.amount) > tol) return false;
                    const tw = words(t.description);
                    return bw.some(w => tw.includes(w)) || tw.some(w => bw.includes(w));
                });
                if (hit) { Store.toggleBillPaid(b.id, m); matched++; }
            });
        });
        return matched;
    }
    function ingestStatement(text) {
        const res = Categorize.parseStatement(text);
        if (res.error) return toast(res.error, "error");
        if (!res.transactions.length) return toast("No transactions found — check the file format.", "error");
        // de-duplicate against what's already stored (safe re-imports)
        const existing = new Set(Store.state.transactions.map(txKey));
        const fresh = [], seen = new Set();
        let dupes = 0;
        res.transactions.forEach(t => {
            const k = txKey(t);
            if (existing.has(k) || seen.has(k)) { dupes++; return; }
            seen.add(k); fresh.push(t);
        });
        if (!fresh.length) { toast(`All ${dupes} transactions were already imported`, ""); return goTo("transactions"); }
        Store.addTransactions(fresh);
        refreshMonthOptions();
        const billHits = autoMatchBills(Array.from(new Set(fresh.map(t => (t.date || "").slice(0, 7)).filter(Boolean))));
        const parts = [`Imported ${fresh.length} transactions`];
        if (dupes) parts.push(`${dupes} duplicate${dupes === 1 ? "" : "s"} skipped`);
        if (res.skipped) parts.push(`${res.skipped} unparseable`);
        toast(parts.join(" · "), "success");
        if (billHits) toast(`${billHits} bill${billHits === 1 ? "" : "s"} auto-marked as paid`, "success");
        goTo("transactions");
    }

    /* ---------- modals ---------- */
    function txForm(t) {
        const opts = Categorize.names().map(n => `<option ${t&&n===t.category?"selected":""}>${n}</option>`).join("");
        return `<div class="form-row"><label>Date</label><input type="date" id="mDate" value="${t?t.date:new Date().toISOString().slice(0,10)}"></div>
            <div class="form-row"><label>Description</label><input id="mDesc" value="${t?esc(t.description):""}" placeholder="e.g. Grocery store"></div>
            <div class="form-grid">
                <div class="form-row"><label>Amount (negative = expense)</label><input id="mAmt" type="number" step="0.01" value="${t?t.amount:""}" placeholder="-25.00"></div>
                <div class="form-row"><label>Category</label><select id="mCat">${opts}</select></div>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Note (optional)</label><input id="mNote" value="${t?esc(t.note||""):""}" placeholder="Add a note"></div>
                <div class="form-row"><label>Tags (comma-separated)</label><input id="mTags" value="${t&&t.tags?esc(t.tags.join(", ")):""}" placeholder="vacation, work"></div>
            </div>
            ${Store.state.members.length ? `<div class="form-row"><label>Who spent it?</label><select id="mMember">
                <option value="">Unassigned</option>
                ${Store.state.members.map(m => `<option value="${m.id}" ${t&&t.member===m.id?"selected":""}>${esc(m.name)}</option>`).join("")}
            </select></div>` : ""}`;
    }
    function readMember() { const el = $("#mMember"); return el ? (el.value || null) : null; }
    function parseTags(raw) {
        return Array.from(new Set(String(raw || "").split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean)));
    }
    function openAddTx() {
        openModal(`<h3>Add transaction</h3>${txForm(null)}<div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">Add</button></div>`);
        $("#mDesc").addEventListener("input", () => { $("#mCat").value = Categorize.categorize($("#mDesc").value, Number($("#mAmt").value)); });
        bindClick("#mCancel", closeModal);
        bindClick("#mSave", () => { const amt = Number($("#mAmt").value);
            if (!$("#mDesc").value.trim() || isNaN(amt) || amt === 0) return toast("Enter a description and non-zero amount", "error");
            Store.addTransaction({ date: $("#mDate").value, description: $("#mDesc").value, amount: amt, category: $("#mCat").value, note: $("#mNote").value, tags: parseTags($("#mTags").value), member: readMember() });
            Store.save(); refreshMonthOptions();
            const hits = autoMatchBills([($("#mDate").value || "").slice(0, 7)]);
            closeModal(); toast("Transaction added", "success");
            if (hits) toast(`${hits} bill${hits === 1 ? "" : "s"} auto-marked as paid`, "success");
            renderActive(); });
    }
    function openEditTx(id) {
        const t = Store.state.transactions.find(x => x.id === id); if (!t) return;
        openModal(`<h3>Edit transaction</h3>${txForm(t)}<div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">Save</button></div>`);
        bindClick("#mCancel", closeModal);
        bindClick("#mSave", () => { const amt = Number($("#mAmt").value);
            if (!$("#mDesc").value.trim() || isNaN(amt) || amt === 0) return toast("Enter a description and non-zero amount", "error");
            Store.updateTransaction(id, { date: $("#mDate").value, description: $("#mDesc").value, amount: amt, category: $("#mCat").value, note: $("#mNote").value, tags: parseTags($("#mTags").value), member: readMember() });
            refreshMonthOptions(); closeModal(); toast("Transaction updated", "success"); renderActive(); });
    }
    function openSplitTx(id) {
        const t = Store.state.transactions.find(x => x.id === id);
        if (!t || t.amount >= 0) return;
        const total = Math.abs(t.amount);
        const catOpts = sel => Categorize.names().filter(n => n !== "Income")
            .map(n => `<option ${n === sel ? "selected" : ""}>${n}</option>`).join("");
        let rows = [
            { category: t.category, amount: (total / 2).toFixed(2) },
            { category: "Other", amount: (total - total / 2).toFixed(2) }
        ];
        function body() {
            return `<h3>Split transaction</h3>
                <p class="muted" style="font-size:13px;margin-bottom:14px">${esc(t.description)} · ${esc(t.date)} · total <strong>${fmt(t.amount)}</strong></p>
                <div id="splitRows">${rows.map((r, i) => `
                    <div class="split-row">
                        <select data-scat="${i}">${catOpts(r.category)}</select>
                        <input data-samt="${i}" type="number" step="0.01" min="0" value="${r.amount}">
                        <button class="link-btn danger" data-sdel="${i}" ${rows.length <= 2 ? "disabled style='opacity:.3'" : ""}>×</button>
                    </div>`).join("")}
                </div>
                <button class="link-btn" id="splitAdd">+ Add part</button>
                <div class="split-remainder" id="splitRemainder"></div>
                <div class="modal-actions"><button class="btn btn-ghost" id="spCancel">Cancel</button><button class="btn" id="spSave">Split</button></div>`;
        }
        function readRows() {
            rows = rows.map((r, i) => ({
                category: $(`[data-scat="${i}"]`) ? $(`[data-scat="${i}"]`).value : r.category,
                amount: $(`[data-samt="${i}"]`) ? $(`[data-samt="${i}"]`).value : r.amount
            }));
        }
        function remainder() {
            const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
            return Math.round((total - sum) * 100) / 100;
        }
        function refresh() {
            openModal(body());
            wire();
            update();
        }
        function update() {
            const rem = remainder();
            const el = $("#splitRemainder");
            el.textContent = rem === 0 ? "✓ Parts add up exactly" : (rem > 0 ? `${fmt(rem)} left to assign` : `${fmt(-rem)} over the total`);
            el.style.color = rem === 0 ? "var(--green)" : "var(--red)";
            $("#spSave").disabled = rem !== 0;
        }
        function wire() {
            $$("[data-samt]").forEach(inp => inp.addEventListener("input", () => { readRows(); update(); }));
            $$("[data-scat]").forEach(sel => sel.addEventListener("change", readRows));
            $$("[data-sdel]").forEach(b => b.addEventListener("click", () => {
                if (rows.length <= 2) return;
                readRows(); rows.splice(Number(b.dataset.sdel), 1); refresh();
            }));
            bindClick("#splitAdd", () => { readRows(); rows.push({ category: "Other", amount: Math.max(0, remainder()).toFixed(2) }); refresh(); });
            bindClick("#spCancel", closeModal);
            bindClick("#spSave", () => {
                readRows();
                if (remainder() !== 0) return;
                if (Store.splitTransaction(id, rows.map(r => ({ category: r.category, amount: Number(r.amount) })))) {
                    closeModal(); toast(`Split into ${rows.length} parts`, "success"); renderActive();
                } else toast("Could not split — check the amounts", "error");
            });
        }
        refresh();
    }

    function openSetBudget(cat) {
        const cur = Store.state.budgets[cat] || "";
        openModal(`<h3>Budget for ${esc(cat)}</h3><div class="form-row"><label>Monthly limit (${CUR()})</label><input id="bAmt" type="number" step="1" value="${cur}" placeholder="e.g. 400"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="bCancel">Cancel</button><button class="btn" id="bSave">Save</button></div>`);
        bindClick("#bCancel", closeModal);
        bindClick("#bSave", () => { Store.setBudget(cat, $("#bAmt").value); closeModal(); toast("Budget saved", "success"); renderActive(); });
    }
    function autoSuggestBudgets() {
        const months = Store.availableMonths().slice(0, 3);
        if (!months.length) return toast("No spending history to base budgets on", "error");
        const cats = Categorize.names().filter(n => n !== "Income" && !Categorize.isNeutral(n));
        const sums = {};
        cats.forEach(c => sums[c] = 0);
        months.forEach(m => Store.txForMonth(m).filter(t => t.amount < 0).forEach(t => { if (sums[t.category] !== undefined) sums[t.category] += -t.amount; }));
        let count = 0;
        cats.forEach(c => { const avg = sums[c] / months.length; if (avg > 5) { Store.setBudget(c, Math.ceil(avg / 10) * 10); count++; } });
        toast(`Set ${count} budgets from your ${months.length}-month average`, "success"); renderActive();
    }
    function applyTemplate503020() {
        const income = Finance.estimatedMonthlyIncome();
        if (!income) { toast("Set your monthly income in Settings first", "error"); return; }
        const NEEDS = ["Housing", "Groceries", "Utilities", "Transport", "Health"];
        const WANTS = ["Dining", "Shopping", "Entertainment"];
        const needsPot = income * 0.5, wantsPot = income * 0.3;
        // weight within each group by 3-month spending history, fallback to equal
        const months = Store.availableMonths().slice(0, 3);
        const hist = {};
        months.forEach(m => Store.txForMonth(m).filter(t => t.amount < 0).forEach(t => hist[t.category] = (hist[t.category] || 0) + (-t.amount)));
        const allocate = (cats, pot) => {
            const total = cats.reduce((a, c) => a + (hist[c] || 0), 0);
            cats.forEach(c => {
                const share = total > 0 ? (hist[c] || 0) / total : 1 / cats.length;
                const amt = Math.round((pot * share) / 10) * 10;
                if (amt > 0) Store.setBudget(c, amt);
            });
        };
        openModal(`<h3>Apply 50/30/20 template?</h3>
            <p class="muted" style="font-size:13px;margin-bottom:14px">Based on your ${fmt(income)}/mo income:<br>
            · <strong>50% needs</strong> (${fmtShort(needsPot)}) → housing, groceries, utilities, transport, health<br>
            · <strong>30% wants</strong> (${fmtShort(wantsPot)}) → dining, shopping, entertainment<br>
            · <strong>20% savings</strong> (${fmtShort(income*0.2)}) → kept unbudgeted for goals &amp; saving<br><br>
            Amounts are split within each group using your recent spending pattern. This replaces existing budgets for those categories.</p>
            <div class="modal-actions"><button class="btn btn-ghost" id="tCancel">Cancel</button><button class="btn" id="tApply">Apply template</button></div>`);
        bindClick("#tCancel", closeModal);
        bindClick("#tApply", () => {
            allocate(NEEDS, needsPot); allocate(WANTS, wantsPot);
            closeModal(); toast("50/30/20 budgets applied", "success"); renderActive();
        });
    }
    function openGoalModal(id) {
        const g = id ? Store.state.goals.find(x => x.id === id) : null;
        openModal(`<h3>${g ? "Edit" : "New"} saving goal</h3>
            <div class="form-row"><label>Goal name</label><input id="gName" value="${g?esc(g.name):""}" placeholder="e.g. Emergency fund"></div>
            <div class="form-grid"><div class="form-row"><label>Target amount</label><input id="gTarget" type="number" step="1" value="${g?g.target:""}" placeholder="5000"></div>
                <div class="form-row"><label>Already saved</label><input id="gSaved" type="number" step="1" value="${g?g.saved:0}" placeholder="0"></div></div>
            <div class="form-row"><label>Target date (optional)</label><input id="gDeadline" type="date" value="${g&&g.deadline?g.deadline:""}"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="gCancel">Cancel</button><button class="btn" id="gSave">${g?"Save":"Create"}</button></div>`);
        bindClick("#gCancel", closeModal);
        bindClick("#gSave", () => { const name = $("#gName").value.trim(), target = Number($("#gTarget").value);
            if (!name || isNaN(target) || target <= 0) return toast("Enter a name and target amount", "error");
            const data = { name, target, saved: Number($("#gSaved").value) || 0, deadline: $("#gDeadline").value || null };
            if (g) Store.updateGoal(g.id, data); else Store.addGoal(data);
            closeModal(); toast(g ? "Goal updated" : "Goal created", "success"); renderActive(); });
    }
    // Add funds to a goal, celebrating when it crosses 100%.
    function contributeToGoal(id, amount, successMsg) {
        const g = Store.state.goals.find(x => x.id === id);
        if (!g) return;
        const wasDone = g.target > 0 && g.saved >= g.target;
        Store.updateGoal(g.id, { saved: Math.max(0, g.saved + amount) });
        const nowDone = g.target > 0 && g.saved + 0.001 >= g.target;
        if (!wasDone && nowDone) toast(`🎉 ${g.name} is fully funded — congratulations!`, "success");
        else if (successMsg) toast(successMsg, "success");
    }
    function openContribute(id) {
        const g = Store.state.goals.find(x => x.id === id);
        openModal(`<h3>Add funds to ${esc(g.name)}</h3><p class="muted" style="margin-bottom:14px">Currently ${fmt(g.saved)} of ${fmt(g.target)}.</p>
            <div class="form-row"><label>Amount to add</label><input id="cAmt" type="number" step="1" placeholder="100"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="cCancel">Cancel</button><button class="btn" id="cSave">Add funds</button></div>`);
        bindClick("#cCancel", closeModal);
        bindClick("#cSave", () => { const add = Number($("#cAmt").value); if (isNaN(add) || add === 0) return toast("Enter an amount", "error");
            contributeToGoal(g.id, add, "Funds added"); closeModal(); renderActive(); });
    }
    function openAccountModal(id) {
        const a = id ? Store.state.accounts.find(x => x.id === id) : null;
        const types = ["Checking", "Savings", "Cash", "Investment", "Credit Card", "Loan", "Other"];
        const curs = ["", "$", "€", "£", "¥", "₹", "A$", "C$", "R$", "CHF", "kr"];
        openModal(`<h3>${a ? "Edit" : "Add"} account</h3>
            <div class="form-row"><label>Account name</label><input id="aName" value="${a?esc(a.name):""}" placeholder="e.g. Chase Checking"></div>
            <div class="form-grid"><div class="form-row"><label>Type</label><select id="aType">${types.map(t=>`<option ${a&&a.type===t?"selected":""}>${t}</option>`).join("")}</select></div>
                <div class="form-row"><label>Balance</label><input id="aBal" type="number" step="0.01" value="${a?a.balance:""}" placeholder="0.00"></div></div>
            <div class="form-grid"><div class="form-row"><label>Currency</label><select id="aCur">${curs.map(c=>`<option value="${c}" ${a&&a.currency===c?"selected":""}>${c===""?`Base (${esc(CUR())})`:c}</option>`).join("")}</select></div>
                <div class="form-row"><label>Rate → base (1 unit = ? ${esc(CUR())})</label><input id="aRate" type="number" step="0.0001" value="${a&&a.rate!==1?a.rate:""}" placeholder="1"></div></div>
            <div class="form-grid"><div class="form-row"><label>APR % (debt only)</label><input id="aApr" type="number" step="0.1" value="${a?a.apr:""}" placeholder="0"></div>
                <div class="form-row"><label>Min. payment (debt)</label><input id="aMin" type="number" step="1" value="${a?a.minPayment:""}" placeholder="0"></div></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="aCancel">Cancel</button><button class="btn" id="aSave">${a?"Save":"Add"}</button></div>`);
        bindClick("#aCancel", closeModal);
        bindClick("#aSave", () => { const name = $("#aName").value.trim(); if (!name) return toast("Enter an account name", "error");
            const type = $("#aType").value; const kind = (type === "Credit Card" || type === "Loan") ? "liability" : "asset";
            const currency = $("#aCur").value;
            const rate = currency ? (Number($("#aRate").value) || 1) : 1;
            const data = { name, type, kind, balance: Number($("#aBal").value) || 0, apr: Number($("#aApr").value) || 0, minPayment: Number($("#aMin").value) || 0, currency, rate };
            if (a) Store.updateAccount(a.id, data); else Store.addAccount(data);
            closeModal(); toast(a ? "Account updated" : "Account added", "success"); renderActive(); });
    }
    function openBillModal(id) {
        const b = id ? Store.state.bills.find(x => x.id === id) : null;
        const opts = Categorize.names().map(n => `<option ${b&&b.category===n?"selected":""}>${n}</option>`).join("");
        openModal(`<h3>${b ? "Edit" : "Add"} bill</h3>
            <div class="form-row"><label>Bill name</label><input id="blName" value="${b?esc(b.name):""}" placeholder="e.g. Rent"></div>
            <div class="form-grid"><div class="form-row"><label>Amount</label><input id="blAmt" type="number" step="0.01" value="${b?b.amount:""}" placeholder="0.00"></div>
                <div class="form-row"><label>Due day of month</label><input id="blDue" type="number" min="1" max="31" value="${b?b.dueDay:1}"></div></div>
            <div class="form-row"><label>Category</label><select id="blCat">${opts}</select></div>
            <label class="switch mb-18"><input type="checkbox" id="blAuto" ${b&&b.autopay?"checked":""}><span class="track"></span>On autopay</label>
            <div class="modal-actions"><button class="btn btn-ghost" id="blCancel">Cancel</button><button class="btn" id="blSave">${b?"Save":"Add"}</button></div>`);
        bindClick("#blCancel", closeModal);
        bindClick("#blSave", () => { const name = $("#blName").value.trim(), amt = Number($("#blAmt").value);
            if (!name || isNaN(amt) || amt <= 0) return toast("Enter a name and amount", "error");
            const data = { name, amount: amt, dueDay: Number($("#blDue").value) || 1, category: $("#blCat").value, autopay: $("#blAuto").checked };
            if (b) Store.updateBill(b.id, data); else Store.addBill(data);
            closeModal(); toast(b ? "Bill updated" : "Bill added", "success"); renderActive(); });
    }
    function openSubModal() {
        const opts = Categorize.names().map(n => `<option ${n==="Entertainment"?"selected":""}>${n}</option>`).join("");
        openModal(`<h3>Add subscription</h3>
            <div class="form-row"><label>Service name</label><input id="sbName" placeholder="e.g. Netflix"></div>
            <div class="form-grid"><div class="form-row"><label>Amount</label><input id="sbAmt" type="number" step="0.01" placeholder="0.00"></div>
                <div class="form-row"><label>Billing cycle</label><select id="sbCycle"><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div></div>
            <div class="form-row"><label>Category</label><select id="sbCat">${opts}</select></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="sbCancel">Cancel</button><button class="btn" id="sbSave">Add</button></div>`);
        bindClick("#sbCancel", closeModal);
        bindClick("#sbSave", () => { const name = $("#sbName").value.trim(), amt = Number($("#sbAmt").value);
            if (!name || isNaN(amt) || amt <= 0) return toast("Enter a name and amount", "error");
            Store.addSubscription({ name, amount: amt, cycle: $("#sbCycle").value, category: $("#sbCat").value });
            closeModal(); toast("Subscription added", "success"); renderActive(); });
    }
    function openCategoryModal() {
        const colors = ["#3fb950","#f0883e","#58a6ff","#bc8cff","#56d4dd","#db61a2","#f778ba","#ff7b72","#d2a8ff","#8b98a5"];
        openModal(`<h3>Add custom category</h3>
            <div class="form-row"><label>Name</label><input id="ccName" placeholder="e.g. Pets"></div>
            <div class="form-row"><label>Keywords (comma-separated, for auto-matching)</label><input id="ccKw" placeholder="petco, chewy, vet"></div>
            <div class="form-row"><label>Color</label><select id="ccColor">${colors.map(c=>`<option value="${c}" style="background:${c}">${c}</option>`).join("")}</select></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="ccCancel">Cancel</button><button class="btn" id="ccSave">Add</button></div>`);
        bindClick("#ccCancel", closeModal);
        bindClick("#ccSave", () => { const name = $("#ccName").value.trim(); if (!name) return toast("Enter a name", "error");
            const kw = $("#ccKw").value.split(",").map(k => k.trim()).filter(Boolean);
            Store.addCategory({ name, kw, color: $("#ccColor").value }); closeModal(); toast("Category added", "success"); renderActive(); });
    }

    /* ---------- export / import ---------- */
    function exportData() {
        const blob = new Blob([JSON.stringify(Store.exportState(), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `fintrack-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        toast("Backup exported", "success");
    }
    function exportCSV() {
        const rows = Store.state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date));
        if (!rows.length) return toast("No transactions to export", "error");
        const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
        const lines = [["Date", "Description", "Category", "Amount", "Note"].join(",")]
            .concat(rows.map(t => [t.date, q(t.description), t.category, t.amount.toFixed(2), q(t.note || "")].join(",")));
        const blob = new Blob([lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `fintrack-transactions-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        toast(`Exported ${rows.length} transactions to CSV`, "success");
    }
    function importData(file) {
        const r = new FileReader();
        r.onload = e => { try { const obj = JSON.parse(e.target.result);
            if (Store.importState(obj)) { refreshMonthOptions(); toast("Backup imported", "success"); goTo("dashboard"); }
            else toast("Invalid backup file", "error"); } catch (err) { toast("Could not read backup", "error"); } };
        r.readAsText(file);
    }
    function confirmReset() {
        openModal(`<h3>Reset all data?</h3><p class="muted" style="margin-bottom:18px">This permanently deletes everything stored in this browser.</p>
            <div class="modal-actions"><button class="btn btn-ghost" id="rCancel">Cancel</button><button class="btn" style="background:var(--red)" id="rConfirm">Reset everything</button></div>`);
        bindClick("#rCancel", closeModal);
        bindClick("#rConfirm", () => { Store.reset(); currentMonth = null; monthInput.value = ""; closeModal(); toast("All data reset"); goTo("dashboard"); });
    }

    /* ---------- PWA install ---------- */
    let deferredPrompt = null;
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; });
    function triggerInstall() {
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; }); }
        else toast("Use your browser's ‘Add to Home Screen’ / install option", "");
    }

    /* ---------- month options ---------- */
    function refreshMonthOptions() { const m = Store.availableMonths(); if (m.length) monthInput.max = m[0]; }

    /* ---------- demo data ---------- */
    function loadDemo() {
        const keepSettings = JSON.parse(JSON.stringify(Store.state.settings));
        Store.reset();
        Store.updateSettings(keepSettings); // loading sample data must not wipe user preferences
        const today = new Date();
        const catByDesc = d => Categorize.categorize(d, -1);
        const merchants = {
            Groceries: ["Whole Foods Market", "Trader Joe's", "Safeway", "Costco Wholesale"],
            Dining: ["Starbucks", "Chipotle", "Uber Eats", "Local Bistro", "Dunkin"],
            Transport: ["Uber", "Shell Gas Station", "Metro Transit", "Chevron Fuel"],
            Utilities: ["Comcast Internet", "City Electric", "Water Utility"],
            Shopping: ["Amazon", "Target", "Best Buy", "H&M"],
            Entertainment: ["AMC Cinema", "Steam Games", "Concert Ticket"],
            Health: ["CVS Pharmacy", "Dental Clinic"]
        };
        const ranges = { Groceries:[35,120], Dining:[8,45], Transport:[12,70], Utilities:[40,130], Shopping:[15,160], Entertainment:[10,60], Health:[15,90] };
        const txs = [];
        for (let mAgo = 5; mAgo >= 0; mAgo--) {
            const base = new Date(today.getFullYear(), today.getMonth() - mAgo, 1);
            const y = base.getFullYear(), mo = String(base.getMonth() + 1).padStart(2, "0");
            txs.push({ date: `${y}-${mo}-01`, description: "Payroll Deposit — Acme Corp", amount: 4200 + Math.round(Math.random()*200), category: "Income" });
            txs.push({ date: `${y}-${mo}-03`, description: "Monthly Rent", amount: -1450, category: "Housing" });
            txs.push({ date: `${y}-${mo}-05`, description: "Transfer to Savings", amount: -500, category: "Savings" });
            const count = 20 + Math.floor(Math.random() * 8);
            for (let i = 0; i < count; i++) {
                const catNames = Object.keys(merchants);
                const cat = catNames[Math.floor(Math.random() * catNames.length)];
                const merch = merchants[cat][Math.floor(Math.random() * merchants[cat].length)];
                const [lo, hi] = ranges[cat]; const amt = -(lo + Math.random() * (hi - lo));
                const day = String(2 + Math.floor(Math.random() * 26)).padStart(2, "0");
                txs.push({ date: `${y}-${mo}-${day}`, description: merch, amount: Math.round(amt * 100) / 100, category: catByDesc(merch) });
            }
        }
        Store.addTransactions(txs);
        [["Groceries",500],["Dining",300],["Transport",250],["Shopping",300],["Entertainment",150],["Utilities",350],["Health",200]].forEach(([c,l]) => Store.setBudget(c, l));
        Store.setRollover("Dining", true);
        Store.addGoal({ name: "Emergency Fund", target: 12000, saved: 6800, deadline: new Date(today.getFullYear()+1, today.getMonth(), 1).toISOString().slice(0,10) });
        Store.addGoal({ name: "Vacation to Japan", target: 4000, saved: 1500, deadline: new Date(today.getFullYear(), today.getMonth()+8, 1).toISOString().slice(0,10) });
        Store.addGoal({ name: "New Laptop", target: 2000, saved: 1750, deadline: null });
        // accounts
        Store.addAccount({ name: "Chase Checking", type: "Checking", balance: 3250, kind: "asset" });
        Store.addAccount({ name: "Ally Savings", type: "Savings", balance: 15400, kind: "asset" });
        Store.addAccount({ name: "Vanguard Brokerage", type: "Investment", balance: 22800, kind: "asset" });
        Store.addAccount({ name: "Amex Credit Card", type: "Credit Card", balance: 1840, kind: "liability", apr: 22.9, minPayment: 75 });
        Store.addAccount({ name: "Car Loan", type: "Loan", balance: 9600, kind: "liability", apr: 6.5, minPayment: 320 });
        // net worth snapshots (trend)
        let nwVal = Finance.netWorth().total - 5000;
        for (let i = 5; i >= 0; i--) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            Store.state.netWorthSnapshots.push({ date: d.toISOString().slice(0,10), value: Math.round(nwVal) }); nwVal += 850 + Math.random()*400; }
        Store.snapshotNetWorth(Finance.netWorth().total);
        // bills
        [["Rent",1450,3,"Housing",true],["Electric",95,12,"Utilities",false],["Internet",70,15,"Utilities",true],["Phone",55,20,"Utilities",true],["Gym",39,1,"Health",true]].forEach(([n,a,d,c,ap]) => Store.addBill({ name:n, amount:a, dueDay:d, category:c, autopay:ap }));
        // subscriptions
        [["Netflix",15.99,"monthly"],["Spotify",10.99,"monthly"],["Disney+",13.99,"monthly"],["Amazon Prime",139,"yearly"],["iCloud+",2.99,"monthly"]].forEach(([n,a,cy]) => Store.addSubscription({ name:n, amount:a, cycle:cy, category:"Entertainment" }));
        Store.save();
        refreshMonthOptions(); currentMonth = null; monthInput.value = "";
        toast("Sample data loaded", "success"); goTo("dashboard");
    }
    $("#loadDemo").addEventListener("click", loadDemo);

    /* ---------- app lock (PIN) ---------- */
    async function sha256Hex(str) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    function randomSalt() {
        const a = new Uint8Array(16); crypto.getRandomValues(a);
        return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    function showLockScreen() {
        if ($("#lockScreen")) return;
        const el = document.createElement("div");
        el.id = "lockScreen";
        el.className = "lock-screen";
        el.innerHTML = `
            <div class="lock-box">
                <svg class="brand-logo" viewBox="0 0 512 512" aria-hidden="true" style="width:52px;height:52px;margin:0 auto 14px">
                    <defs><linearGradient id="lkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a78d6"/><stop offset="1" stop-color="#4a3aa7"/></linearGradient></defs>
                    <rect width="512" height="512" rx="112" fill="url(#lkg)"/>
                    <polyline points="112,352 200,286 268,318 400,168" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="400" cy="168" r="22" fill="#fff"/>
                </svg>
                <h3 style="margin-bottom:4px">Fintrack is locked</h3>
                <p class="muted" style="font-size:13px;margin-bottom:16px">Enter your PIN to unlock</p>
                <input id="lockPin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" aria-label="PIN">
                <p id="lockErr" class="lock-err" hidden>Wrong PIN — try again</p>
                <button class="btn" id="lockUnlock" style="width:100%;margin-top:12px">Unlock</button>
                <button class="link-btn danger" id="lockForgot" style="margin-top:14px">Forgot PIN? Erase all data</button>
            </div>`;
        document.body.appendChild(el);
        const tryUnlock = async () => {
            const pin = $("#lockPin").value;
            let ok = false;
            if (Store.isVaultLocked()) {
                // encrypted at rest: a successful AES-GCM decrypt IS the PIN check
                ok = await Store.unlockVault(pin);
                if (ok) { refreshMonthOptions(); renderActive(); }
            } else {
                const st = Store.state.settings;
                ok = (await sha256Hex(st.pinSalt + pin)) === st.pinHash;
            }
            if (ok) el.remove();
            else { $("#lockErr").hidden = false; $("#lockPin").value = ""; $("#lockPin").focus(); }
        };
        $("#lockUnlock").addEventListener("click", tryUnlock);
        $("#lockPin").addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
        $("#lockForgot").addEventListener("click", () => {
            if (confirm("This permanently erases ALL Fintrack data in this browser so nobody can read it without the PIN. Continue?")) {
                Store.reset();
                try { localStorage.removeItem("fintrack.onboarded"); } catch (e) {}
                location.reload();
            }
        });
        setTimeout(() => $("#lockPin").focus(), 50);
    }
    function openSetPin(change) {
        openModal(`<h3>${change ? "Change" : "Set"} app lock PIN</h3>
            <p class="muted" style="font-size:12.5px;margin-bottom:14px">Fintrack will require this PIN every time it opens. The PIN is stored only as a salted SHA-256 hash — it never leaves this device.</p>
            ${change ? `<div class="form-row"><label>Current PIN</label><input id="pinOld" type="password" inputmode="numeric" maxlength="8"></div>` : ""}
            <div class="form-grid">
                <div class="form-row"><label>New PIN (4–8 digits)</label><input id="pinNew" type="password" inputmode="numeric" maxlength="8"></div>
                <div class="form-row"><label>Confirm PIN</label><input id="pinNew2" type="password" inputmode="numeric" maxlength="8"></div>
            </div>
            <div class="modal-actions"><button class="btn btn-ghost" id="pinCancel">Cancel</button><button class="btn" id="pinSave">Save PIN</button></div>`);
        bindClick("#pinCancel", closeModal);
        bindClick("#pinSave", async () => {
            const st = Store.state.settings;
            if (change) {
                const oldHash = await sha256Hex(st.pinSalt + ($("#pinOld").value || ""));
                if (oldHash !== st.pinHash) return toast("Current PIN is wrong", "error");
            }
            const p1 = $("#pinNew").value, p2 = $("#pinNew2").value;
            if (!/^\d{4,8}$/.test(p1)) return toast("PIN must be 4–8 digits", "error");
            if (p1 !== p2) return toast("PINs don't match", "error");
            const salt = randomSalt();
            const hash = await sha256Hex(salt + p1);
            Store.updateSettings({ pinSalt: salt, pinHash: hash });
            await Store.enableVault(p1); // encrypt everything at rest with this PIN
            closeModal(); toast("App lock on — data now encrypted at rest", "success"); renderActive();
        });
    }
    function openDisablePin() {
        openModal(`<h3>Turn off app lock</h3>
            <div class="form-row"><label>Current PIN</label><input id="pinOff" type="password" inputmode="numeric" maxlength="8"></div>
            <div class="modal-actions"><button class="btn btn-ghost" id="pinOffCancel">Cancel</button><button class="btn" id="pinOffSave">Turn off</button></div>`);
        bindClick("#pinOffCancel", closeModal);
        bindClick("#pinOffSave", async () => {
            const st = Store.state.settings;
            const hash = await sha256Hex(st.pinSalt + ($("#pinOff").value || ""));
            if (hash !== st.pinHash) return toast("Wrong PIN", "error");
            Store.updateSettings({ pinHash: null, pinSalt: null });
            await Store.disableVault(); // rewrite storage as plaintext
            closeModal(); toast("App lock disabled", "success"); renderActive();
        });
    }

    /* ---------- onboarding ---------- */
    function maybeOnboard() {
        const fresh = Store.state.transactions.length === 0 && Store.state.accounts.length === 0;
        let seen = false;
        try { seen = !!localStorage.getItem("fintrack.onboarded"); } catch (e) {}
        if (!fresh || seen) return;
        const currencies = ["$", "€", "£", "¥", "₹", "A$", "C$", "R$"];
        openModal(`
            <div style="text-align:center;margin-bottom:18px">
                <div style="width:54px;height:54px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:grid;place-items:center;font-size:26px;color:#fff;margin:0 auto 12px">₿</div>
                <h3 style="margin-bottom:4px">Welcome to Fintrack</h3>
                <p class="muted" style="font-size:13px">Private, on-device budgeting. Two quick questions and you're set.</p>
            </div>
            <div class="form-grid">
                <div class="form-row"><label>Currency</label><select id="obCur">${currencies.map(c=>`<option ${c===CUR()?"selected":""}>${c}</option>`).join("")}</select></div>
                <div class="form-row"><label>Monthly income (optional)</label><input id="obIncome" type="number" min="0" placeholder="e.g. 4200"></div>
            </div>
            <button class="btn" id="obStart" style="width:100%;margin-bottom:8px">Get started — import a statement</button>
            <button class="btn btn-ghost" id="obDemo" style="width:100%">Explore with sample data</button>
            <p class="muted" style="font-size:11.5px;text-align:center;margin-top:12px">Nothing leaves your device. You can change everything later in Settings.</p>`);
        const done = () => { try { localStorage.setItem("fintrack.onboarded", "1"); } catch (e) {} };
        const saveAnswers = () => Store.updateSettings({ currency: $("#obCur").value, monthlyIncome: Number($("#obIncome").value) || 0 });
        bindClick("#obStart", () => { saveAnswers(); done(); closeModal(); toast("You're set — import your first statement", "success"); goTo("upload"); });
        bindClick("#obDemo", () => { saveAnswers(); done(); closeModal(); loadDemo(); });
    }

    /* ---------- boot ---------- */
    refreshMonthOptions();
    renderActive();
    if ((Store.isVaultLocked() || Store.state.settings.pinHash) && window.crypto && crypto.subtle) showLockScreen();
    else maybeOnboard();
})();
