/**
 * Tally design system v2 — DESIGN.md (FROZEN spec, supersedes CONTRACTS.md §4).
 * Every value here traces to a CSS custom property in src/styles/tokens.css —
 * never a raw hex.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
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
        positive: 'var(--positive)',
        caution: 'var(--caution)',
        negative: 'var(--negative)',
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
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      // Type scale — DESIGN.md §3. Deliberately finer than v1, with real jumps
      // between steps (weight/tracking/colour, not just size, carry hierarchy —
      // see the .money/.money-hero/.label utilities in src/styles/index.css).
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['13px', { lineHeight: '18px' }],
        sm: ['15px', { lineHeight: '22px' }],
        md: ['17px', { lineHeight: '24px' }],
        lg: ['22px', { lineHeight: '28px' }],
        xl: ['30px', { lineHeight: '36px' }],
        '2xl': ['40px', { lineHeight: '44px' }],
      },
      // Radius — DESIGN.md §4: one radius per role, not one radius everywhere.
      borderRadius: {
        control: '8px', // buttons, inputs, chips' inner corner where not pill
        card: '14px', // cards, list groups
        sheet: '22px', // bottom sheets, menus, popovers
        pill: '999px', // chips, toggles, fully-rounded controls
      },
      // Motion — DESIGN.md §4: 140-180ms, cubic-bezier(0.2,0,0,1), transform/
      // opacity only. `duration-140`/`duration-180` give both ends of that
      // window as explicit utilities (Tailwind's default numeric scale
      // doesn't include either); `ease-standard` is the required curve.
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
