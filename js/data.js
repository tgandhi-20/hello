/* ============================================================
   Fintrack — data layer (localStorage persistence)
   ============================================================ */
(function (global) {
    "use strict";

    const STORE_KEY = "fintrack.v1";

    const DEFAULT_STATE = {
        version: 2,
        transactions: [], // {id, date, description, amount, category, type, accountId, note, tags[]}
        budgets: {},      // {category: monthlyLimit}
        budgetRollover: {},// {category: true}  carry unused/overspend to next month
        goals: [],        // {id, name, target, saved, deadline, createdAt}
        accounts: [],     // {id, name, type, balance, kind:'asset'|'liability', apr, minPayment}
        bills: [],        // {id, name, amount, dueDay, category, autopay, paidMonths:[]}
        subscriptions: [],// {id, name, amount, cycle:'monthly'|'yearly', category, active, nextDue}
        customCategories: [], // {name, color, kw:[]}
        members: [],          // {id, name} household members
        netWorthSnapshots: [],// {date, value}
        settings: {
            currency: "$",
            monthlyIncome: 0,
            roundupEnabled: false,
            roundupGoalId: null
        }
    };

    function uid(p) {
        return (p || "id") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function migrate(s) {
        // fill any missing top-level keys from defaults (forward compatible)
        const base = structuredClone(DEFAULT_STATE);
        const out = Object.assign(base, s);
        out.settings = Object.assign(structuredClone(DEFAULT_STATE.settings), s.settings || {});
        // legacy: settings.monthlyIncomeEstimate -> monthlyIncome
        if (s.settings && s.settings.monthlyIncomeEstimate && !out.settings.monthlyIncome) {
            out.settings.monthlyIncome = s.settings.monthlyIncomeEstimate;
        }
        return out;
    }

    /* ---------- Encrypted vault (AES-GCM, key derived from PIN) ----------
       When app lock is enabled the whole store is encrypted at rest:
       PBKDF2(PIN, salt, 150k iters) -> AES-256-GCM. Without the PIN the
       payload is cryptographically unreadable, even with device access. */
    const VAULT_ITERS = 150000;
    let encKey = null;       // in-memory key while unlocked
    let vaultSalt = null;
    let vaultLocked = false; // an encrypted payload exists and isn't unlocked yet
    let writeSeq = 0;

    const hexToBuf = h => new Uint8Array((h.match(/.{2}/g) || []).map(b => parseInt(b, 16)));
    const bufToHex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("");
    function bufToB64(buf) {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }
    const b64ToBuf = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    function randomHex(n) {
        const a = new Uint8Array(n); crypto.getRandomValues(a); return bufToHex(a);
    }
    async function deriveKey(pin, saltHex) {
        const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: hexToBuf(saltHex), iterations: VAULT_ITERS, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    }
    async function saveEncrypted() {
        const seq = ++writeSeq;
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encKey,
                new TextEncoder().encode(JSON.stringify(state)));
            if (seq !== writeSeq) return; // a newer write superseded this one
            localStorage.setItem(STORE_KEY, JSON.stringify({ __vault: true, v: 1, kdfSalt: vaultSalt, iv: bufToHex(iv), data: bufToB64(ct) }));
        } catch (e) { console.error("Encrypted save failed", e); }
    }
    async function unlockVault(pin) {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
            if (!parsed || !parsed.__vault) return false;
            const key = await deriveKey(pin, parsed.kdfSalt);
            const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBuf(parsed.iv) }, key, b64ToBuf(parsed.data));
            state = migrate(JSON.parse(new TextDecoder().decode(plain)));
            encKey = key; vaultSalt = parsed.kdfSalt; vaultLocked = false;
            return true;
        } catch (e) { return false; } // wrong PIN => GCM auth failure
    }
    async function enableVault(pin) {
        vaultSalt = randomHex(16);
        encKey = await deriveKey(pin, vaultSalt);
        await saveEncrypted();
    }
    async function disableVault() {
        encKey = null; vaultSalt = null;
        save(); // rewrites plaintext
    }
    const isVaultLocked = () => vaultLocked;
    const hasVaultKey = () => !!encKey;

    // Encrypted backup file: same envelope format as at-rest storage.
    async function exportEncrypted() {
        if (!encKey) throw new Error("vault key not available");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encKey,
            new TextEncoder().encode(JSON.stringify(state)));
        return JSON.stringify({ __vault: true, v: 1, kdfSalt: vaultSalt, iv: bufToHex(iv), data: bufToB64(ct) });
    }
    async function importEncryptedBackup(obj, pin) {
        try {
            const key = await deriveKey(pin, obj.kdfSalt);
            const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBuf(obj.iv) }, key, b64ToBuf(obj.data));
            state = migrate(JSON.parse(new TextDecoder().decode(plain)));
            vaultSalt = obj.kdfSalt; encKey = key; vaultLocked = false;
            await saveEncrypted();
            return true;
        } catch (e) { return false; }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return structuredClone(DEFAULT_STATE);
            const parsed = JSON.parse(raw);
            if (parsed && parsed.__vault) {
                vaultLocked = true; vaultSalt = parsed.kdfSalt;
                return structuredClone(DEFAULT_STATE); // real state arrives after unlock
            }
            return migrate(parsed);
        } catch (e) {
            console.error("Failed to load state", e);
            return structuredClone(DEFAULT_STATE);
        }
    }

    let state = load();

    function save() {
        if (encKey) { saveEncrypted(); return; }
        writeSeq++; // supersede any in-flight encrypted write (e.g. right after disabling the vault)
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
        catch (e) { console.error("Failed to save", e); }
    }

    function reset() { state = structuredClone(DEFAULT_STATE); save(); }

    function importState(obj) {
        try {
            state = migrate(obj);
            save();
            return true;
        } catch (e) { return false; }
    }
    function exportState() { return JSON.parse(JSON.stringify(state)); }

    /* ---------- Transactions ---------- */
    function addTransaction(tx) {
        const t = {
            id: uid("tx"),
            date: tx.date,
            description: (tx.description || "").trim(),
            amount: Number(tx.amount) || 0,
            category: tx.category || "Other",
            type: (Number(tx.amount) || 0) >= 0 ? "income" : "expense",
            accountId: tx.accountId || null,
            member: tx.member || null,
            note: tx.note || "",
            tags: tx.tags || []
        };
        state.transactions.push(t);
        return t;
    }
    function addTransactions(list) { const a = list.map(addTransaction); save(); return a; }
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
        if (limit === null || limit === "" || Number(limit) <= 0) delete state.budgets[category];
        else state.budgets[category] = Number(limit);
        save();
    }
    function setRollover(category, on) {
        if (on) state.budgetRollover[category] = true;
        else delete state.budgetRollover[category];
        save();
    }

    /* ---------- Goals ---------- */
    function addGoal(goal) {
        const g = { id: uid("goal"), name: goal.name, target: Number(goal.target) || 0,
            saved: Number(goal.saved) || 0, deadline: goal.deadline || null,
            createdAt: new Date().toISOString().slice(0, 10) };
        state.goals.push(g); save(); return g;
    }
    function updateGoal(id, patch) {
        const g = state.goals.find(x => x.id === id);
        if (!g) return;
        Object.assign(g, patch);
        if (patch.target !== undefined) g.target = Number(patch.target) || 0;
        if (patch.saved !== undefined) g.saved = Number(patch.saved) || 0;
        save();
    }
    function deleteGoal(id) { state.goals = state.goals.filter(g => g.id !== id); save(); }

    /* ---------- Accounts ---------- */
    function addAccount(a) {
        const acc = { id: uid("acc"), name: a.name, type: a.type || "Checking",
            balance: Number(a.balance) || 0, kind: a.kind || "asset",
            apr: Number(a.apr) || 0, minPayment: Number(a.minPayment) || 0,
            currency: a.currency || "",            // "" = base currency
            rate: Number(a.rate) || 1 };           // 1 unit = rate × base
        state.accounts.push(acc); save(); return acc;
    }
    function updateAccount(id, patch) {
        const a = state.accounts.find(x => x.id === id);
        if (!a) return;
        Object.assign(a, patch);
        ["balance", "apr", "minPayment", "rate"].forEach(k => { if (patch[k] !== undefined) a[k] = Number(patch[k]) || (k === "rate" ? 1 : 0); });
        save();
    }
    function deleteAccount(id) { state.accounts = state.accounts.filter(a => a.id !== id); save(); }

    /* ---------- Bills ---------- */
    function addBill(b) {
        const bill = { id: uid("bill"), name: b.name, amount: Number(b.amount) || 0,
            dueDay: Number(b.dueDay) || 1, category: b.category || "Utilities",
            autopay: !!b.autopay, paidMonths: [] };
        state.bills.push(bill); save(); return bill;
    }
    function updateBill(id, patch) {
        const b = state.bills.find(x => x.id === id);
        if (!b) return; Object.assign(b, patch);
        if (patch.amount !== undefined) b.amount = Number(patch.amount) || 0;
        if (patch.dueDay !== undefined) b.dueDay = Number(patch.dueDay) || 1;
        save();
    }
    function deleteBill(id) { state.bills = state.bills.filter(b => b.id !== id); save(); }
    function toggleBillPaid(id, monthStr) {
        const b = state.bills.find(x => x.id === id);
        if (!b) return;
        const i = b.paidMonths.indexOf(monthStr);
        if (i === -1) b.paidMonths.push(monthStr); else b.paidMonths.splice(i, 1);
        save();
    }

    /* ---------- Subscriptions ---------- */
    function addSubscription(s) {
        const sub = { id: uid("sub"), name: s.name, amount: Number(s.amount) || 0,
            cycle: s.cycle || "monthly", category: s.category || "Entertainment",
            active: s.active !== false, nextDue: s.nextDue || null };
        state.subscriptions.push(sub); save(); return sub;
    }
    function updateSubscription(id, patch) {
        const s = state.subscriptions.find(x => x.id === id);
        if (!s) return; Object.assign(s, patch);
        if (patch.amount !== undefined) s.amount = Number(patch.amount) || 0;
        save();
    }
    function deleteSubscription(id) { state.subscriptions = state.subscriptions.filter(s => s.id !== id); save(); }

    /* ---------- Custom categories ---------- */
    function addCategory(c) {
        if (!c.name) return;
        if (state.customCategories.some(x => x.name.toLowerCase() === c.name.toLowerCase())) return;
        state.customCategories.push({ name: c.name, color: c.color || "#8b98a5",
            kw: (c.kw || []).map(k => k.toLowerCase()) });
        save();
    }
    function deleteCategory(name) {
        state.customCategories = state.customCategories.filter(c => c.name !== name);
        save();
    }

    /* ---------- Household members ---------- */
    function addMember(name) {
        name = String(name || "").trim();
        if (!name) return null;
        if (state.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return null;
        const m = { id: uid("mem"), name };
        state.members.push(m); save(); return m;
    }
    function deleteMember(id) {
        state.members = state.members.filter(m => m.id !== id);
        // unassign from transactions
        state.transactions.forEach(t => { if (t.member === id) t.member = null; });
        save();
    }

    /* ---------- Split a transaction into parts ---------- */
    // parts = [{category, amount (positive)}]; amounts must sum to |original|.
    function splitTransaction(id, parts) {
        const t = state.transactions.find(x => x.id === id);
        if (!t || t.amount >= 0 || parts.length < 2) return false;
        const total = parts.reduce((a, p) => a + Number(p.amount), 0);
        if (Math.abs(total - Math.abs(t.amount)) > 0.01) return false;
        const sign = -1;
        parts.forEach(p => {
            state.transactions.push({
                id: uid("tx"), date: t.date, description: t.description,
                amount: Math.round(Number(p.amount) * 100) / 100 * sign,
                category: p.category, type: "expense",
                accountId: t.accountId, member: t.member || null,
                note: t.note || "", tags: Array.from(new Set([...(t.tags || []), "split"]))
            });
        });
        state.transactions = state.transactions.filter(x => x.id !== id);
        save();
        return true;
    }

    /* ---------- Net worth snapshots ---------- */
    function snapshotNetWorth(value) {
        const date = new Date().toISOString().slice(0, 10);
        const existing = state.netWorthSnapshots.find(s => s.date === date);
        if (existing) existing.value = value;
        else state.netWorthSnapshots.push({ date, value });
        state.netWorthSnapshots.sort((a, b) => a.date.localeCompare(b.date));
        save();
    }

    /* ---------- Settings ---------- */
    function updateSettings(patch) {
        Object.assign(state.settings, patch);
        save();
    }

    /* ---------- Derived helpers ---------- */
    function txForMonth(monthStr) {
        if (!monthStr) return state.transactions.slice();
        return state.transactions.filter(t => (t.date || "").slice(0, 7) === monthStr);
    }
    function availableMonths() {
        const set = new Set(state.transactions.map(t => (t.date || "").slice(0, 7)).filter(Boolean));
        return Array.from(set).sort().reverse();
    }

    global.Store = {
        get state() { return state; },
        uid, save, reset, importState, exportState,
        unlockVault, enableVault, disableVault, isVaultLocked, hasVaultKey,
        exportEncrypted, importEncryptedBackup,
        addTransaction, addTransactions, updateTransaction, deleteTransaction,
        setBudget, setRollover,
        addGoal, updateGoal, deleteGoal,
        addAccount, updateAccount, deleteAccount,
        addBill, updateBill, deleteBill, toggleBillPaid,
        addSubscription, updateSubscription, deleteSubscription,
        addCategory, deleteCategory,
        addMember, deleteMember, splitTransaction,
        snapshotNetWorth, updateSettings,
        txForMonth, availableMonths
    };
})(window);
