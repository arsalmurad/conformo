import { defineConfig } from '@playwright/test';

/**
 * The end-to-end gate: a Playwright test that creates an invoice end to end
 * and asserts the downloaded PDF passes tools/validate.py. Runs against the
 * PRODUCTION build (`vite build` + `vite preview`), not the dev server —
 * that's what actually ships, and it's the only mode where the service
 * worker (and therefore the offline story) is real. This gate exists so
 * that path is checked by CI on every push, not just by hand.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false, // one worker: the local numbering counter is shared, global IndexedDB state
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5183',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build --workspace=packages/ui && npm run preview --workspace=packages/ui -- --port 5183',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
