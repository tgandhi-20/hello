/* ============================================================
   Fintrack — data layer (localStorage persistence)
   ============================================================ */
(function (global) {
    "use strict";

    const STORE_KEY = "fintrack.v1";

    const DEFAULT_STATE = {
        transactions: [], // {id, date, description, amount (neg=expense), category, type}
        budgets: {},      // {category: monthlyLimit}
        goals: [],        // {id, name, target, saved, deadline, createdAt}
        settings: { currency: "$", monthlyIncomeEstimate: 0 }
    };

    function uid() {
        return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return structuredClone(DEFAULT_STATE);
            const parsed = JSON.parse(raw);
            return Object.assign(structuredClone(DEFAULT_STATE), parsed);
        } catch (e) {
            console.error("Failed to load state", e);
            return structuredClone(DEFAULT_STATE);
        }
    }

    let state = load();

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Failed to save", e);
        }
    }

    function reset() {
        state = structuredClone(DEFAULT_STATE);
        save();
    }

    /* ---------- Transactions ---------- */
    function addTransaction(tx) {
        const t = {
            id: uid(),
            date: tx.date,
            description: (tx.description || "").trim(),
            amount: Number(tx.amount) || 0,
            category: tx.category || "Other",
            type: (Number(tx.amount) || 0) >= 0 ? "income" : "expense"
        };
        state.transactions.push(t);
        return t;
    }

    function addTransactions(list) {
        const added = list.map(addTransaction);
        save();
        return added;
    }

    function updateTransaction(id, patch) {
        const t = state.transactions.find(x => x.id === id);
        if (!t) return;
        Object.assign(t, patch);
        if (patch.amount !== undefined) {
            t.amount = Number(patch.amount) || 0;
            t.type = t.amount >= 0 ? "income" : "expense";
        }
        save();
    }

    function deleteTransaction(id) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        save();
    }

    /* ---------- Budgets ---------- */
    function setBudget(category, limit) {
        if (limit === null || limit === "" || Number(limit) <= 0) {
            delete state.budgets[category];
        } else {
            state.budgets[category] = Number(limit);
        }
        save();
    }

    /* ---------- Goals ---------- */
    function addGoal(goal) {
        const g = {
            id: uid(),
            name: goal.name,
            target: Number(goal.target) || 0,
            saved: Number(goal.saved) || 0,
            deadline: goal.deadline || null,
            createdAt: new Date().toISOString().slice(0, 10)
        };
        state.goals.push(g);
        save();
        return g;
    }
    function updateGoal(id, patch) {
        const g = state.goals.find(x => x.id === id);
        if (!g) return;
        Object.assign(g, patch);
        if (patch.target !== undefined) g.target = Number(patch.target) || 0;
        if (patch.saved !== undefined) g.saved = Number(patch.saved) || 0;
        save();
    }
    function deleteGoal(id) {
        state.goals = state.goals.filter(g => g.id !== id);
        save();
    }

    function setIncomeEstimate(v) {
        state.settings.monthlyIncomeEstimate = Number(v) || 0;
        save();
    }

    /* ---------- Derived helpers ---------- */
    function txForMonth(monthStr) {
        // monthStr = "YYYY-MM" or null for all
        if (!monthStr) return state.transactions.slice();
        return state.transactions.filter(t => (t.date || "").slice(0, 7) === monthStr);
    }

    function availableMonths() {
        const set = new Set(state.transactions.map(t => (t.date || "").slice(0, 7)).filter(Boolean));
        return Array.from(set).sort().reverse();
    }

    global.Store = {
        get state() { return state; },
        uid, save, reset,
        addTransaction, addTransactions, updateTransaction, deleteTransaction,
        setBudget, addGoal, updateGoal, deleteGoal, setIncomeEstimate,
        txForMonth, availableMonths
    };
})(window);
