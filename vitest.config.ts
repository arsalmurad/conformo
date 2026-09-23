import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: {
    // e2e/ holds @playwright/test specs, not vitest ones — its own `test()`
    // isn't vitest's, and letting vitest collect it fails the whole run
    // (confirmed: this is what actually happens without the exclude, not a
    // hypothetical conflict).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@invoice-engine/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@invoice-engine/formats': fileURLToPath(new URL('./packages/formats/src/index.ts', import.meta.url)),
      '@invoice-engine/pdf': fileURLToPath(new URL('./packages/pdf/src/index.ts', import.meta.url)),
      '@invoice-engine/parse': fileURLToPath(new URL('./packages/parse/src/index.ts', import.meta.url)),
      '@invoice-engine/compliance-data': fileURLToPath(new URL('./packages/compliance-data/src/index.ts', import.meta.url)),
      '@invoice-engine/validate/browser': fileURLToPath(new URL('./packages/validate/src/browser.ts', import.meta.url)),
      '@invoice-engine/validate': fileURLToPath(new URL('./packages/validate/src/index.ts', import.meta.url)),
    },
  },
});
