/* ============================================================
   Fintrack — financial computations (net worth, safe-to-spend,
   spend pace, cash-flow forecast, debt payoff, budget rollover)
   ============================================================ */
(function (global) {
    "use strict";

    function monthKey(d) { return (d || "").slice(0, 7); }
    function prevMonth(m) {
        const [y, mo] = m.split("-").map(Number);
        const d = new Date(y, mo - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    function daysInMonth(m) {
        const [y, mo] = m.split("-").map(Number);
        return new Date(y, mo, 0).getDate();
    }
    function currentMonthKey() { return new Date().toISOString().slice(0, 7); }

    /* ---------- Net worth ---------- */
    // Foreign-currency balances convert to base via the account's rate.
    function netWorth() {
        const accts = Store.state.accounts;
        let assets = 0, liabilities = 0;
        accts.forEach(a => {
            const base = a.balance * (a.rate || 1);
            if (a.kind === "liability") liabilities += Math.abs(base);
            else assets += base;
        });
        return { assets, liabilities, total: assets - liabilities };
    }

    /* ---------- Monthly recurring obligations ---------- */
    function monthlyBills() {
        return Store.state.bills.reduce((a, b) => a + b.amount, 0);
    }
    function monthlySubscriptions() {
        return Store.state.subscriptions.filter(s => s.active).reduce((a, s) => {
            return a + (s.cycle === "yearly" ? s.amount / 12 : s.amount);
        }, 0);
    }
    function annualSubscriptions() {
        return Store.state.subscriptions.filter(s => s.active).reduce((a, s) => {
            return a + (s.cycle === "yearly" ? s.amount : s.amount * 12);
        }, 0);
    }

    /* ---------- Income figure ---------- */
    // Prefer explicit setting; else derive from recent month income transactions
    function estimatedMonthlyIncome() {
        const set = Store.state.settings.monthlyIncome;
        if (set && set > 0) return set;
        const months = Store.availableMonths();
        if (!months.length) return 0;
        // average income over up to 3 recent months
        const recent = months.slice(0, 3);
        let total = 0, n = 0;
        recent.forEach(m => {
            const inc = Store.txForMonth(m).filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0);
            if (inc > 0) { total += inc; n++; }
        });
        return n ? total / n : 0;
    }

    /* ---------- Safe to spend (PocketGuard style) ---------- */
    // income - bills - subscriptions - budgeted savings/goals - already spent this month
    function safeToSpend(monthStr) {
        const m = monthStr || currentMonthKey();
        const income = estimatedMonthlyIncome();
        const bills = monthlyBills();
        const subs = monthlySubscriptions();
        // planned monthly goal contributions: spread remaining goal over its horizon isn't tracked,
        // so use a simple heuristic: 10% of income earmarked if goals exist, else 0
        const goalReserve = Store.state.goals.length ? income * 0.1 : 0;
        const spent = Store.txForMonth(m).filter(t => t.amount < 0)
            .reduce((a, t) => a + (-t.amount), 0);
        // avoid double counting: bills/subs may already appear as transactions; use max(spent, bills+subs) floor
        const committed = bills + subs + goalReserve;
        const safe = income - Math.max(spent, 0) - goalReserve;
        return { income, bills, subs, goalReserve, spent, committed, safe };
    }

    /* ---------- Spend pace (are you on track this month?) ---------- */
    function spendPace(monthStr) {
        const m = monthStr || currentMonthKey();
        const spent = Store.txForMonth(m).filter(t => t.amount < 0).reduce((a, t) => a + (-t.amount), 0);
        const dim = daysInMonth(m);
        const now = new Date();
        const isCurrent = m === currentMonthKey();
        const dayOfMonth = isCurrent ? now.getDate() : dim;
        const budgetTotal = Object.values(Store.state.budgets).reduce((a, b) => a + b, 0);
        const income = estimatedMonthlyIncome();
        const plan = budgetTotal > 0 ? budgetTotal : (income > 0 ? income * 0.7 : spent);
        const expectedByNow = plan * (dayOfMonth / dim);
        const projectedEnd = dayOfMonth > 0 ? spent * (dim / dayOfMonth) : spent;
        let status = "ok";
        if (plan > 0) {
            if (projectedEnd > plan * 1.05) status = "over";
            else if (spent > expectedByNow * 1.1) status = "fast";
        }
        return { spent, plan, expectedByNow, projectedEnd, dayOfMonth, dim, status, isCurrent };
    }

    /* ---------- Budget rollover ---------- */
    // For a category with rollover on, carry (limit - spent) from the previous month.
    function budgetWithRollover(category, monthStr) {
        const base = Store.state.budgets[category] || 0;
        if (!base || !Store.state.budgetRollover[category] || !monthStr) return { effective: base, carry: 0, base };
        const pm = prevMonth(monthStr);
        const prevSpent = Store.txForMonth(pm).filter(t => t.amount < 0 && t.category === category)
            .reduce((a, t) => a + (-t.amount), 0);
        const carry = base - prevSpent; // positive = leftover added, negative = overspend deducted
        return { effective: Math.max(0, base + carry), carry, base };
    }

    /* ---------- Cash-flow forecast ---------- */
    // Project end-of-horizon net position from current cash + recurring income/outgoings.
    function cashFlowForecast(months = 6) {
        const cashAccounts = Store.state.accounts
            .filter(a => a.kind === "asset" && /check|cash|saving/i.test(a.type));
        let startCash = cashAccounts.reduce((a, x) => a + x.balance * (x.rate || 1), 0);
        if (startCash === 0) startCash = 0;
        const income = estimatedMonthlyIncome();
        const bills = monthlyBills();
        const subs = monthlySubscriptions();
        // average discretionary spend from recent months (excluding bill/sub categories approx)
        const recent = Store.availableMonths().slice(0, 3);
        let avgSpend = 0;
        if (recent.length) {
            const totals = recent.map(m => Store.txForMonth(m).filter(t => t.amount < 0).reduce((a, t) => a + (-t.amount), 0));
            avgSpend = totals.reduce((a, b) => a + b, 0) / totals.length;
        }
        const monthlyOut = Math.max(avgSpend, bills + subs);
        const monthlyNet = income - monthlyOut;
        const points = [];
        let bal = startCash;
        const now = new Date();
        for (let i = 0; i <= months; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            points.push({ label: d.toLocaleString(undefined, { month: "short" }), value: Math.round(bal) });
            bal += monthlyNet;
        }
        return { points, startCash, income, monthlyOut, monthlyNet };
    }

    /* ---------- Debt payoff (avalanche/snowball-ish single account) ---------- */
    function payoffMonths(balance, apr, monthlyPayment) {
        balance = Math.abs(balance);
        if (monthlyPayment <= 0) return Infinity;
        const r = (apr / 100) / 12;
        if (r === 0) return Math.ceil(balance / monthlyPayment);
        // if payment doesn't cover interest, never pays off
        if (monthlyPayment <= balance * r) return Infinity;
        const n = -Math.log(1 - (balance * r) / monthlyPayment) / Math.log(1 + r);
        return Math.ceil(n);
    }
    function totalInterest(balance, apr, monthlyPayment) {
        const n = payoffMonths(balance, apr, monthlyPayment);
        if (!isFinite(n)) return Infinity;
        return Math.max(0, n * monthlyPayment - Math.abs(balance));
    }

    /* ---------- Round-up auto-save ---------- */
    // Virtual "spare change": for every expense since the last sweep, the
    // difference to the next whole unit accrues toward a chosen goal.
    function roundupAccrued() {
        const since = Store.state.settings.roundupLastSweep || "0000-00-00";
        const today = new Date().toISOString().slice(0, 10);
        const isNeutral = c => global.Categorize && global.Categorize.isNeutral(c);
        let total = 0, count = 0;
        Store.state.transactions.forEach(t => {
            if (t.amount >= 0 || isNeutral(t.category)) return;
            if (!t.date || t.date <= since || t.date > today) return;
            const a = -t.amount;
            const up = Math.ceil(a) - a;
            if (up > 0.004) { total += up; count++; }
        });
        return { total: Math.round(total * 100) / 100, count, since: since === "0000-00-00" ? null : since };
    }

    /* ---------- Potential savings levers ---------- */
    // Concrete, computable ways the user could save money each month.
    function savingsLevers(monthStr) {
        const m = monthStr || currentMonthKey();
        const isNeutral = c => global.Categorize && global.Categorize.isNeutral(c);
        const levers = [];

        // 1. Active subscriptions — the ceiling of what trimming could free up
        const subsMo = monthlySubscriptions();
        if (subsMo > 0) levers.push({ id: "subs", label: "Trim unused subscriptions",
            detail: "Your active subscriptions — cancel the ones you don't use.", monthly: subsMo });

        // 2. Over-budget categories this month
        const budgets = Store.state.budgets;
        let overage = 0;
        Object.keys(budgets).forEach(cat => {
            const spent = Store.txForMonth(m).filter(t => t.amount < 0 && t.category === cat)
                .reduce((a, t) => a + (-t.amount), 0);
            if (spent > budgets[cat]) overage += spent - budgets[cat];
        });
        if (overage > 1) levers.push({ id: "budgets", label: "Stick to your budgets",
            detail: "What this month's over-budget categories are costing you.", monthly: overage });

        // 3. Discretionary spend above your own 3-month norm
        const DISC = ["Dining", "Shopping", "Entertainment"];
        let discNow = 0, discAvg = 0, months = 0;
        let pm = m;
        for (let i = 0; i < 3; i++) {
            pm = prevMonth(pm);
            const v = Store.txForMonth(pm).filter(t => t.amount < 0 && DISC.includes(t.category))
                .reduce((a, t) => a + (-t.amount), 0);
            if (v > 0) { discAvg += v; months++; }
        }
        discNow = Store.txForMonth(m).filter(t => t.amount < 0 && DISC.includes(t.category))
            .reduce((a, t) => a + (-t.amount), 0);
        if (months) {
            discAvg /= months;
            if (discNow > discAvg * 1.05 && discNow - discAvg > 5)
                levers.push({ id: "disc", label: "Return to your usual fun-spend",
                    detail: "Dining, shopping & entertainment above your 3-month norm.", monthly: discNow - discAvg });
        }

        const total = levers.reduce((a, l) => a + l.monthly, 0);
        return { levers, monthlyTotal: total, yearlyTotal: total * 12 };
    }

    /* ---------- Insights & anomaly detection ---------- */
    // Compares the given month against the previous 3 months and surfaces
    // spikes, drops, unusually large transactions and possible duplicates.
    function insights(monthStr) {
        const m = monthStr || currentMonthKey();
        const out = [];
        const isNeutral = c => global.Categorize && global.Categorize.isNeutral(c);
        const curTx = Store.txForMonth(m).filter(t => t.amount < 0 && !isNeutral(t.category));

        // per-category totals for current month
        const cur = {};
        curTx.forEach(t => cur[t.category] = (cur[t.category] || 0) + (-t.amount));

        // average per-category over previous 3 months (only months with data)
        const prevMonths = [];
        let pm = m;
        for (let i = 0; i < 3; i++) { pm = prevMonth(pm); prevMonths.push(pm); }
        const prevTotals = {}, prevCount = {}, prevTxCount = {};
        prevMonths.forEach(p => {
            const txs = Store.txForMonth(p).filter(t => t.amount < 0 && !isNeutral(t.category));
            if (!txs.length) return;
            const seen = new Set();
            txs.forEach(t => {
                prevTotals[t.category] = (prevTotals[t.category] || 0) + (-t.amount);
                prevTxCount[t.category] = (prevTxCount[t.category] || 0) + 1;
                seen.add(t.category);
            });
            seen.forEach(c => prevCount[c] = (prevCount[c] || 0) + 1);
        });

        // day-of-month scaling so a mid-month check compares like-for-like
        const now = new Date();
        const isCurrent = m === currentMonthKey();
        const frac = isCurrent ? Math.max(0.15, now.getDate() / daysInMonth(m)) : 1;

        Object.keys(cur).forEach(cat => {
            if (!prevCount[cat]) return;
            // lumpy categories (~1 tx/month, e.g. rent) can't be pro-rated —
            // compare against the full-month average instead
            const txPerMonth = prevTxCount[cat] / prevCount[cat];
            const catFrac = txPerMonth <= 2 ? 1 : frac;
            const avg = (prevTotals[cat] / prevCount[cat]) * catFrac;
            if (avg < 25) return; // too small to be meaningful
            const ratio = cur[cat] / avg;
            if (ratio >= 1.5) out.push({ kind: "spike", severity: "warn", cat,
                title: `${cat} is running ${Math.round((ratio - 1) * 100)}% above your usual`,
                detail: `Spent so far vs your 3-month average for this point in the month.`,
                value: cur[cat] });
            else if (ratio <= 0.55) out.push({ kind: "drop", severity: "good", cat,
                title: `${cat} is ${Math.round((1 - ratio) * 100)}% below your usual`,
                detail: `Nice — keep it up and this month comes in well under trend.`,
                value: cur[cat] });
        });

        // unusually large single transactions (vs median expense)
        const amounts = curTx.map(t => -t.amount).sort((a, b) => a - b);
        if (amounts.length >= 5) {
            const median = amounts[Math.floor(amounts.length / 2)];
            curTx.filter(t => (-t.amount) >= Math.max(100, median * 4))
                .sort((a, b) => a.amount - b.amount).slice(0, 2)
                .forEach(t => out.push({ kind: "large", severity: "info", cat: t.category,
                    title: `Large expense: ${t.description}`,
                    detail: `${t.date} · well above your typical transaction.`,
                    value: -t.amount }));
        }

        // possible duplicate charges: same description+amount within 2 days
        const byKey = {};
        curTx.forEach(t => {
            const k = t.description.trim().toLowerCase() + "|" + t.amount.toFixed(2);
            (byKey[k] = byKey[k] || []).push(t);
        });
        Object.values(byKey).forEach(list => {
            if (list.length < 2) return;
            list.sort((a, b) => a.date.localeCompare(b.date));
            for (let i = 1; i < list.length; i++) {
                const gap = (new Date(list[i].date) - new Date(list[i - 1].date)) / 86400000;
                if (gap <= 2 && gap >= 0) {
                    out.push({ kind: "duplicate", severity: "bad", cat: list[i].category,
                        title: `Possible duplicate charge: ${list[i].description}`,
                        detail: `Charged twice within ${gap === 0 ? "the same day" : Math.round(gap) + " day(s)"} (${list[i - 1].date} and ${list[i].date}).`,
                        value: -list[i].amount });
                    break;
                }
            }
        });

        const rank = { bad: 0, warn: 1, info: 2, good: 3 };
        out.sort((a, b) => rank[a.severity] - rank[b.severity]);
        // guarantee each detected kind is represented, then fill by severity
        const picked = [], seenKind = new Set();
        out.forEach(i => { if (!seenKind.has(i.kind)) { picked.push(i); seenKind.add(i.kind); } });
        out.forEach(i => { if (picked.length < 5 && !picked.includes(i)) picked.push(i); });
        return picked.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 5);
    }

    global.Finance = {
        insights, roundupAccrued, savingsLevers,
        netWorth, monthlyBills, monthlySubscriptions, annualSubscriptions,
        estimatedMonthlyIncome, safeToSpend, spendPace, budgetWithRollover,
        cashFlowForecast, payoffMonths, totalInterest,
        currentMonthKey, prevMonth, daysInMonth
    };
})(window);
