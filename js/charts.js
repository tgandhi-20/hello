/* ============================================================
   Fintrack — lightweight inline-SVG charts (no dependencies)
   ============================================================ */
(function (global) {
    "use strict";

    function resolveColor(c) {
        // resolve CSS var() to actual color for SVG fills
        const m = /^var\((--[\w-]+)\)$/.exec(c);
        if (m) {
            return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#8b98a5";
        }
        return c;
    }

    // Donut chart. data = [{label, value, color}]
    // A 2px surface gap separates adjacent segments (CVD mitigation).
    function donut(data, size = 180, thickness = 26) {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        const r = (size - thickness) / 2;
        const cx = size / 2, cy = size / 2;
        const circ = 2 * Math.PI * r;
        const visible = data.filter(d => d.value > 0);
        const gap = visible.length > 1 ? 2 : 0;
        let offset = 0;
        const segs = visible.map(d => {
            const frac = d.value / total;
            const len = Math.max(0.5, frac * circ - gap);
            const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="${resolveColor(d.color)}" stroke-width="${thickness}"
                stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-(offset + gap / 2)}"
                transform="rotate(-90 ${cx} ${cy})"><title>${d.label}: ${d.value}</title></circle>`;
            offset += frac * circ;
            return seg;
        }).join("");
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-3)" stroke-width="${thickness}"></circle>
            ${segs}
        </svg>`;
    }

    // Ring gauge for a 0-100 value. opts.color overrides the score-based color.
    function gauge(score, size = 170, opts = {}) {
        const thickness = opts.thickness || 16;
        const r = (size - thickness) / 2;
        const cx = size / 2, cy = size / 2;
        const circ = 2 * Math.PI * r;
        const len = (Math.max(0, Math.min(100, score)) / 100) * circ;
        const color = opts.color || (score >= 75 ? "var(--green)" : score >= 50 ? "var(--amber)" : "var(--red)");
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-3)" stroke-width="${thickness}"></circle>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${resolveColor(color)}" stroke-width="${thickness}"
                stroke-linecap="round" stroke-dasharray="${len} ${circ - len}"
                transform="rotate(-90 ${cx} ${cy})"></circle>
        </svg>`;
    }

    // Simple vertical bar chart. data = [{label, value}]
    function bars(data, opts = {}) {
        const max = Math.max(1, ...data.map(d => d.value));
        const cols = data.map(d => {
            const h = (d.value / max) * 100;
            const title = `${d.label}: ${opts.fmt ? opts.fmt(d.value) : d.value}`;
            return `<div class="bcol" title="${title}">
                <div class="bfill" style="height:${h}%"></div>
                <div class="blabel">${d.label}</div>
            </div>`;
        }).join("");
        return `<div class="bar-chart">${cols}</div>`;
    }

    // Line/area chart. points = [{label, value}]; opts.color, opts.fmt
    function line(points, opts = {}) {
        if (!points.length) return `<p class="muted">Not enough data.</p>`;
        const w = 100, h = 46, pad = 2;
        const vals = points.map(p => p.value);
        let min = Math.min(...vals), max = Math.max(...vals);
        if (min === max) { min -= 1; max += 1; }
        const color = opts.color || "var(--accent)";
        const n = points.length;
        const x = i => pad + (i / Math.max(1, n - 1)) * (w - 2 * pad);
        const y = v => (h - pad) - ((v - min) / (max - min)) * (h - 2 * pad);
        const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
        const area = `${x(0).toFixed(2)},${h} ${line} ${x(n - 1).toFixed(2)},${h}`;
        const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(2)}" cy="${y(p.value).toFixed(2)}" r="0.9" fill="${resolveColor(color)}"><title>${p.label}: ${opts.fmt ? opts.fmt(p.value) : p.value}</title></circle>`).join("");
        const labels = points.map((p, i) => `<div class="lch-lab" style="left:${x(i)}%">${p.label}</div>`).join("");
        return `<div class="line-chart">
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:130px;display:block">
                <polygon points="${area}" fill="${resolveColor(color)}" opacity="0.12"></polygon>
                <polyline points="${line}" fill="none" stroke="${resolveColor(color)}" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
                ${dots}
            </svg>
            <div class="lch-labs">${labels}</div>
        </div>`;
    }

    // Month calendar heatmap. monthStr "YYYY-MM", dayTotals {1: 42.5, ...}
    function heatmap(monthStr, dayTotals, opts = {}) {
        const [y, mo] = monthStr.split("-").map(Number);
        const daysIn = new Date(y, mo, 0).getDate();
        const firstDow = new Date(y, mo - 1, 1).getDay(); // 0=Sun
        const max = Math.max(1, ...Object.values(dayTotals));
        const fmt = opts.fmt || (v => v);
        const head = ["S", "M", "T", "W", "T", "F", "S"].map(d => `<div class="hm-h">${d}</div>`).join("");
        let cells = "";
        for (let i = 0; i < firstDow; i++) cells += `<div class="hm-c hm-empty"></div>`;
        for (let d = 1; d <= daysIn; d++) {
            const v = dayTotals[d] || 0;
            const alpha = v > 0 ? 0.15 + 0.85 * Math.min(1, v / max) : 0;
            const style = v > 0 ? `background:rgba(var(--heat-rgb),${alpha.toFixed(2)});color:${alpha > 0.55 ? "#fff" : "var(--text)"}` : "";
            cells += `<div class="hm-c" style="${style}" title="${monthStr}-${String(d).padStart(2, "0")}: ${v > 0 ? fmt(v) : "no spending"}">${d}</div>`;
        }
        return `<div class="heatmap"><div class="hm-grid">${head}${cells}</div>
            <div class="hm-legend"><span class="muted">less</span>
                ${[0.15, 0.4, 0.65, 1].map(a => `<span class="hm-swatch" style="background:rgba(var(--heat-rgb),${a})"></span>`).join("")}
                <span class="muted">more</span></div></div>`;
    }

    global.Charts = { donut, gauge, bars, line, heatmap, resolveColor };
})(window);
