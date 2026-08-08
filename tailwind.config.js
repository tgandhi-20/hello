/**
 * Tally design system v3 — DESIGN-V3.md (FROZEN spec, supersedes DESIGN.md v2
 * and CONTRACTS.md §4). Every value here traces to a CSS custom property in
 * src/styles/tokens.css — never a raw hex.
 *
 * Colour keys below are ONLY the v3 token names (ground, surface,
 * surface-sunk, hairline, ink, accent, caution, critical, cat, scrim). There
 * is deliberately no compatibility-alias block re-mapping old v1/v2 class names
 * (`bg`, `surface.1/2/3`, `positive`, `negative`) onto the new tokens — that
 * exact pattern (see git history: "Delete v1 token aliases") was built and
 * then deleted once during the v1->v2 migration and must not be reintroduced
 * for v2->v3. Some files under src/features/**, src/app/**, src/security/**
 * still reference the old names post-migration; those utilities now compile
 * to nothing (Tailwind silently drops unknown utilities — this does not fail
 * `tsc`/`build`) until the owning agent migrates them. See this agent's
 * report for the exact file list.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: 'var(--ground)',
        surface: {
          DEFAULT: 'var(--surface)',
          sunk: 'var(--surface-sunk)',
        },
        hairline: 'var(--hairline)',
        ink: {
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          'on-accent': 'var(--ink-on-accent)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          press: 'var(--accent-press)',
          tint: 'var(--accent-tint)',
        },
        caution: {
          DEFAULT: 'var(--caution)',
          tint: 'var(--caution-tint)',
        },
        critical: {
          DEFAULT: 'var(--critical)',
          tint: 'var(--critical-tint)',
        },
        scrim: 'var(--scrim)',
        cat: {
          1: 'var(--cat-1)',
          2: 'var(--cat-2)',
          3: 'var(--cat-3)',
          4: 'var(--cat-4)',
          5: 'var(--cat-5)',
          6: 'var(--cat-6)',
          7: 'var(--cat-7)',
          8: 'var(--cat-8)',
          9: 'var(--cat-9)',
          10: 'var(--cat-10)',
          11: 'var(--cat-11)',
          12: 'var(--cat-12)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Type scale — DESIGN-V3.md §2: 12 / 13 / 15 / 17 / 20 / 28 / 40, body 15.
      // Key NAMES kept stable from v2 (2xs..2xl) so existing `text-sm`/`text-md`
      // etc. call sites across the app keep resolving — only the underlying
      // px/line-height values move to the v3 scale.
      fontSize: {
        '2xs': ['12px', { lineHeight: '16px' }],
        xs: ['13px', { lineHeight: '18px' }],
        sm: ['15px', { lineHeight: '22px' }], // body
        md: ['17px', { lineHeight: '24px' }],
        lg: ['20px', { lineHeight: '26px' }],
        xl: ['28px', { lineHeight: '34px' }],
        '2xl': ['40px', { lineHeight: '44px' }],
      },
      // Radius — DESIGN-V3.md §3: card radius is explicitly 16px. control/pill
      // unspecified by v3, kept at their existing values (no reason to move
      // them, and it keeps `rounded-control`/`rounded-pill` call sites stable).
      borderRadius: {
        control: '8px', // buttons, inputs, chips' inner corner where not pill
        card: '16px', // cards, list groups — DESIGN-V3.md §3
        sheet: '22px', // bottom sheets, menus, popovers
        pill: '999px', // chips, toggles, fully-rounded controls
      },
      // Elevation — DESIGN-V3.md §1's exact card shadow, plus this agent's
      // consistent extension for surfaces that sit further off the page
      // (sheets/modals/toasts) — see tokens.css's --shadow-elevated comment.
      // Cards separate from --ground by shadow, never a border on the same
      // element as a shadow.
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
      },
      // Motion — DESIGN-V3.md §3: 140-180ms, cubic-bezier(0.2,0,0,1), transform/
      // opacity only. `duration-140`/`duration-180` give both ends of that
      // window as explicit utilities; `ease-standard` is the required curve.
      transitionDuration: {
        DEFAULT: '180ms',
        140: '140ms',
        180: '180ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
