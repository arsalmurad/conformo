import { defineConfig } from '@playwright/test';

/**
 * The same e2e specs against the deployed sites, after a deploy (no local servers):
 *   VALIDATOR_URL=https://conformo-validate.vercel.app/ npx playwright test --config playwright.live.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  // e2e/screenshots.spec.ts writes docs/screenshots; it is a generator, run only with SCREENSHOTS=1.
  testIgnore: process.env.SCREENSHOTS ? [] : ['**/screenshots.spec.ts'],
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.APP_URL ?? 'https://conformo-three.vercel.app', trace: 'retain-on-failure' },
});
