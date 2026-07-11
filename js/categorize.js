/* ============================================================
   Fintrack — categorization engine + CSV statement parser
   ============================================================ */
(function (global) {
    "use strict";

    // Category definitions with keyword rules and colors (var names from CSS)
    const CATEGORIES = [
        { name: "Groceries",     color: "var(--cat-groceries)",     kw: ["grocery","supermarket","whole foods","trader joe","aldi","lidl","safeway","kroger","tesco","sainsbury","walmart","costco","market","food lion","publix"] },
        { name: "Dining",        color: "var(--cat-dining)",        kw: ["restaurant","cafe","coffee","starbucks","mcdonald","kfc","burger","pizza","chipotle","doordash","ubereats","uber eats","grubhub","deliveroo","dunkin","subway","taco","dining","bar & grill","pub"] },
        { name: "Transport",     color: "var(--cat-transport)",     kw: ["uber","lyft","taxi","transit","metro","subway pass","gas","shell","chevron","bp ","exxon","fuel","parking","toll","bus","train","railway","fuel","petrol"] },
        { name: "Housing",       color: "var(--cat-housing)",       kw: ["rent","mortgage","landlord","hoa","property","lease","apartment"] },
        { name: "Utilities",     color: "var(--cat-utilities)",     kw: ["electric","water bill","gas bill","internet","comcast","verizon","at&t","t-mobile","utility","power","energy","broadband","phone bill","wifi","spectrum"] },
        { name: "Shopping",      color: "var(--cat-shopping)",      kw: ["amazon","ebay","target","best buy","ikea","clothing","zara","h&m","nike","adidas","apple store","store","mall","shop","etsy","aliexpress"] },
        { name: "Entertainment", color: "var(--cat-entertainment)", kw: ["netflix","spotify","hulu","disney","cinema","movie","theater","steam","playstation","xbox","concert","hbo","youtube premium","game","ticket","prime video"] },
        { name: "Health",        color: "var(--cat-health)",        kw: ["pharmacy","cvs","walgreens","doctor","dental","clinic","hospital","gym","fitness","medical","health","insurance","therapy","wellness"] },
        { name: "Income",        color: "var(--cat-income)",        kw: ["salary","payroll","deposit","paycheck","refund","interest","dividend","transfer in","reimbursement"] },
        { name: "Savings",       color: "var(--cat-savings)",       kw: ["savings","investment","vanguard","fidelity","401k","roth","brokerage","transfer to savings"] },
        { name: "Other",         color: "var(--cat-other)",         kw: [] }
    ];

    // Merge built-in categories with any user-defined ones from the store.
    function allCategories() {
        const custom = (global.Store && global.Store.state.customCategories) || [];
        // custom first so user keywords win, but keep Other last
        const builtins = CATEGORIES.filter(c => c.name !== "Other");
        const other = CATEGORIES.find(c => c.name === "Other");
        const names = new Set(custom.map(c => c.name.toLowerCase()));
        const merged = custom.concat(builtins.filter(c => !names.has(c.name.toLowerCase())));
        merged.push(other);
        return merged;
    }

    function categoryColor(name) {
        const all = allCategories();
        const found = all.find(c => c.name === name);
        return (found || all[all.length - 1]).color;
    }

    // Guess a category from a transaction description + amount
    function categorize(description, amount) {
        const d = (description || "").toLowerCase();
        for (const cat of allCategories()) {
            if (cat.name === "Other") continue;
            for (const k of (cat.kw || [])) {
                if (k && d.includes(k)) return cat.name;
            }
        }
        // positive amounts with no match are likely income
        if (Number(amount) > 0) return "Income";
        return "Other";
    }

    /* ---------- CSV parsing ---------- */
    // Robust-enough CSV line splitter that respects quoted fields
    function parseCsvLine(line) {
        const out = [];
        let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQ) {
                if (ch === '"') {
                    if (line[i + 1] === '"') { cur += '"'; i++; }
                    else inQ = false;
                } else cur += ch;
            } else {
                if (ch === '"') inQ = true;
                else if (ch === ",") { out.push(cur); cur = ""; }
                else cur += ch;
            }
        }
        out.push(cur);
        return out.map(s => s.trim());
    }

    function normalizeDate(raw) {
        if (!raw) return null;
        raw = raw.trim();
        // already ISO
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        // DD/MM/YYYY or MM/DD/YYYY or with -
        const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (m) {
            let [, a, b, y] = m;
            if (y.length === 2) y = "20" + y;
            // Heuristic: if first > 12 it must be day (DD/MM); else assume MM/DD (US default)
            let mm, dd;
            if (Number(a) > 12) { dd = a; mm = b; }
            else { mm = a; dd = b; }
            return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
        // Month name formats e.g. "12 Jan 2024" / "Jan 12, 2024"
        const parsed = Date.parse(raw);
        if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
        return null;
    }

    function parseAmount(raw) {
        if (raw === undefined || raw === null) return NaN;
        let s = String(raw).trim();
        if (!s) return NaN;
        let neg = false;
        if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } // (123.45) accounting negative
        s = s.replace(/[^0-9.\-]/g, ""); // strip currency symbols, commas
        let n = parseFloat(s);
        if (isNaN(n)) return NaN;
        if (neg) n = -Math.abs(n);
        return n;
    }

    // Parse a full CSV bank statement into transaction objects.
    // Auto-detects columns for date, description, amount (or debit/credit).
    function parseStatement(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length);
        if (!lines.length) return { transactions: [], error: "File is empty." };

        const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
        const looksLikeHeader = header.some(h => /date|amount|description|debit|credit|payee|memo|details|transaction/.test(h));

        const findCol = (...names) => {
            for (const n of names) {
                const idx = header.findIndex(h => h.includes(n));
                if (idx !== -1) return idx;
            }
            return -1;
        };

        let dateIdx, descIdx, amtIdx, debitIdx, creditIdx;
        if (looksLikeHeader) {
            dateIdx   = findCol("date");
            descIdx   = findCol("description", "payee", "details", "memo", "narrative", "name", "transaction");
            amtIdx    = findCol("amount", "value");
            debitIdx  = findCol("debit", "withdrawal", "money out", "paid out");
            creditIdx = findCol("credit", "deposit", "money in", "paid in");
        } else {
            // No header — assume: date, description, amount
            dateIdx = 0; descIdx = 1; amtIdx = 2;
        }

        const startRow = looksLikeHeader ? 1 : 0;
        const transactions = [];
        let skipped = 0;

        for (let i = startRow; i < lines.length; i++) {
            const cells = parseCsvLine(lines[i]);
            if (!cells.length || cells.every(c => !c)) continue;

            const date = normalizeDate(cells[dateIdx]);
            let desc = descIdx >= 0 ? cells[descIdx] : "";
            if (!desc) {
                // fallback: longest non-numeric cell
                desc = cells.filter(c => c && isNaN(parseAmount(c))).sort((a, b) => b.length - a.length)[0] || "Transaction";
            }

            let amount = NaN;
            if (amtIdx >= 0) {
                amount = parseAmount(cells[amtIdx]);
            } else if (debitIdx >= 0 || creditIdx >= 0) {
                const debit = debitIdx >= 0 ? parseAmount(cells[debitIdx]) : NaN;
                const credit = creditIdx >= 0 ? parseAmount(cells[creditIdx]) : NaN;
                if (!isNaN(credit) && credit !== 0) amount = Math.abs(credit);
                else if (!isNaN(debit) && debit !== 0) amount = -Math.abs(debit);
            }

            if (!date || isNaN(amount)) { skipped++; continue; }

            transactions.push({
                date,
                description: desc,
                amount,
                category: categorize(desc, amount)
            });
        }

        return { transactions, skipped, detectedHeader: looksLikeHeader };
    }

    global.Categorize = {
        CATEGORIES,
        allCategories,
        categoryColor,
        categorize,
        parseStatement,
        parseAmount,
        normalizeDate,
        names: () => allCategories().map(c => c.name)
    };
})(window);
