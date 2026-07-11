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
    function donut(data, size = 180, thickness = 26) {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        const r = (size - thickness) / 2;
        const cx = size / 2, cy = size / 2;
        const circ = 2 * Math.PI * r;
        let offset = 0;
        const segs = data.filter(d => d.value > 0).map(d => {
            const frac = d.value / total;
            const len = frac * circ;
            const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="${resolveColor(d.color)}" stroke-width="${thickness}"
                stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}"
                transform="rotate(-90 ${cx} ${cy})"></circle>`;
            offset += len;
            return seg;
        }).join("");
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-3)" stroke-width="${thickness}"></circle>
            ${segs}
        </svg>`;
    }

    // Ring gauge for a 0-100 score
    function gauge(score, size = 170) {
        const thickness = 16;
        const r = (size - thickness) / 2;
        const cx = size / 2, cy = size / 2;
        const circ = 2 * Math.PI * r;
        const len = (Math.max(0, Math.min(100, score)) / 100) * circ;
        const color = score >= 75 ? "var(--green)" : score >= 50 ? "var(--amber)" : "var(--red)";
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

    global.Charts = { donut, gauge, bars, resolveColor };
})(window);
