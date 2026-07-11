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
    function netWorth() {
        const accts = Store.state.accounts;
        let assets = 0, liabilities = 0;
        accts.forEach(a => {
            if (a.kind === "liability") liabilities += Math.abs(a.balance);
            else assets += a.balance;
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
        let startCash = cashAccounts.reduce((a, x) => a + x.balance, 0);
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

    global.Finance = {
        netWorth, monthlyBills, monthlySubscriptions, annualSubscriptions,
        estimatedMonthlyIncome, safeToSpend, spendPace, budgetWithRollover,
        cashFlowForecast, payoffMonths, totalInterest,
        currentMonthKey, prevMonth, daysInMonth
    };
})(window);
