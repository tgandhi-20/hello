/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },
        border: 'var(--border)',
        text: {
          1: 'var(--text-1)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          pressed: 'var(--accent-pressed)',
        },
        positive: 'var(--positive)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
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
      fontSize: {
        xs: '12px',
        sm: '14px',
        md: '16px',
        lg: '20px',
        xl: '28px',
        '2xl': '40px',
      },
      borderRadius: {
        card: '16px',
        sheet: '24px',
        pill: '999px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
