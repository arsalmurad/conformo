import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@invoice-engine/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@invoice-engine/formats': fileURLToPath(new URL('./packages/formats/src/index.ts', import.meta.url)),
      '@invoice-engine/pdf': fileURLToPath(new URL('./packages/pdf/src/index.ts', import.meta.url)),
    },
  },
});
