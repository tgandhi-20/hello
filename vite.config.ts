import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Read once at build time so the running app can show an honest "which
// build is this" stamp (src/ui/version.ts) — read via fs rather than a
// static `import ... from './package.json'` so it definitely runs at
// config-eval time, before anything is bundled, with no ambiguity about
// whether a JSON import would be inlined verbatim or re-fetched.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version: string;
};

// https://vitejs.dev/config/
export default defineConfig({
  base: '/hello/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // CONTRACTS.md §1 specifies 'autoUpdate'. Deliberately overridden to
      // 'prompt' here — see src/ui/UpdateAvailable.tsx for the full
      // reasoning. Short version: 'autoUpdate' ships with vite-plugin-pwa's
      // auto-injected registration script, which activates a newly-fetched
      // service worker and reloads the page the instant one is found, with
      // no user involvement. That is a genuine data-loss hazard for an
      // installed finance app — a reload mid-transaction-entry can lose the
      // entry. 'prompt' leaves a new worker waiting until this app
      // explicitly tells it to activate (via `updateServiceWorker(true)` in
      // UpdateAvailable.tsx), which only happens when the user taps the
      // in-app "Reload" affordance. `injectRegister: false` pairs with this:
      // registration itself now happens from React (`useRegisterSW`) so
      // there is exactly one registration path, not two.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tally',
        short_name: 'Tally',
        description: 'A private, offline-first budget tracker.',
        display: 'standalone',
        // Matches --bg in src/styles/tokens.css (design system v2,
        // docs/DESIGN.md) — was the v1 pure #000000, which made the
        // standalone splash/status-bar colour disagree with every surface
        // the app actually paints.
        background_color: '#07070A',
        theme_color: '#07070A',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        categories: ['finance'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split third-party deps into their own chunk(s) so they cache
        // independently of app code across deploys (vendor code changes far
        // less often than app code, so this improves cache hit rate on
        // updates without affecting what's precached for offline use).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
