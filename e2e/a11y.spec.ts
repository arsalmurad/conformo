import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';

/** axe-core (WCAG 2.1 A/AA rules): zero serious or critical violations, in light and dark, on the app and the validator. */
test.use({ locale: 'en-US' });

async function serious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`app, ${scheme}: empty, with every error revealed, and with the More menu open`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    expect(await serious(page)).toEqual([]);
    await page.getByRole('radio', { name: /A German public authority/ }).check();
    await page.getByRole('button', { name: /^(Fill in|Fix) \d+/ }).click();
    expect(await serious(page)).toEqual([]);
    await page.locator('.more-menu > summary').click();
    expect(await serious(page)).toEqual([]);
  });

  test(`validator, ${scheme}: empty and with a result`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(process.env.VALIDATOR_URL ?? 'http://localhost:5184/');
    expect(await serious(page)).toEqual([]);
    await page.getByText('Or paste the XML').click();
    await page.getByLabel('Invoice XML').fill('<note/>');
    await expect(page.getByRole('heading', { name: 'This is not an e-invoice we can read' })).toBeVisible({ timeout: 20_000 });
    await page.locator('#tech summary').click();
    expect(await serious(page)).toEqual([]);
  });
}

const DOCS = process.env.DOCS_URL ?? 'http://127.0.0.1:5185/';
for (const scheme of ['light', 'dark'] as const) {
  test(`docs site, ${scheme}: every section page`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const p of ['index.html', 'library.html', 'cli.html', 'mcp.html', 'http.html', 'germany-2027.html', 'conformance.html', 'limits.html', 'countries/index.html', 'countries/de.html']) {
      await page.goto(DOCS + p);
      expect(await serious(page), p).toEqual([]);
    }
  });
}
