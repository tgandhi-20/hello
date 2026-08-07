/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * App version string, injected at build time via `define` in
 * `vite.config.ts` from `package.json`'s `version` field. See
 * `src/ui/version.ts` for the runtime-safe accessor other code should use
 * instead of this global directly.
 */
declare const __APP_VERSION__: string;
