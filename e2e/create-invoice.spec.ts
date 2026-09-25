import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `__dirname` doesn't exist in real ESM (this repo is "type": "module") —
// used to fail here silently under some TS transpilation setups, works
// under others; this is the portable form regardless of how Playwright's
// runner happens to load this file.
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 *  Creates a real invoice through the
 * real UI — profiles, live validation, gapless numbering, the whole editor
 * — downloads the PDF the app actually produces, and shells out to the
 * project's own tools/validate.py against that exact file: the same
 * official-XSD-plus-Schematron-plus-PDF/A check every other gate in this
 * repo runs, not a Playwright-specific re-implementation of "is this a
 * valid invoice."
 */
test('creates an invoice end to end and the downloaded PDF passes tools/validate.py', async ({ page }) => {
  await page.goto('/');

  const discardBtn = page.getByRole('button', { name: /discard it and start a new invoice/i });
  if (await discardBtn.isVisible().catch(() => false)) {
    await discardBtn.click();
  }

  await expect(page.getByRole('button', { name: /assign next number/i })).toBeVisible();
  await page.getByRole('button', { name: /assign next number/i }).click();
  await expect(page.getByRole('button', { name: /assign next number/i })).not.toBeVisible();

  await page.getByLabel('Currency').fill('EUR');
  await page.getByLabel('Issue date').fill('2026-09-22');

  const seller = page.locator('fieldset.party').filter({ hasText: 'Seller' });
  await seller.getByLabel('Name').fill('Northwind Studio SARL');
  await seller.getByLabel('Street').fill('12 Rue Exemple');
  await seller.getByLabel('Postcode').fill('75004');
  await seller.getByLabel('City').fill('Paris');
  await seller.getByLabel('Country').fill('FR');
  await seller.getByLabel('VAT number').fill('FR32123456789');

  const buyer = page.locator('fieldset.party').filter({ hasText: 'Buyer' });
  await buyer.getByLabel('Name').fill('Handelsgesellschaft Muster GmbH');
  await buyer.getByLabel('Street').fill('Hauptstrasse 8');
  await buyer.getByLabel('Postcode').fill('10115');
  await buyer.getByLabel('City').fill('Berlin');
  await buyer.getByLabel('Country').fill('DE');

  await page.getByPlaceholder('Description').fill('Website design');
  const lineRow = page.locator('.line-row').first();
  await lineRow.locator('.line-price').fill('1000');
  await lineRow.locator('.line-rate').fill('20');

  await page.getByLabel('IBAN').fill('FR7630006000011234567890189');

  await expect(page.getByText(/Passes EN 16931/i)).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /download pdf/i }).click();
  const download = await downloadPromise;

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'invoice-e2e-'));
  const pdfPath = path.join(tmpDir, 'invoice.pdf');
  await download.saveAs(pdfPath);

  // tools/validate.py checks out/invoice.pdf specifically (see the project's own build plan);
  // no CLI arg for an arbitrary path, so this drops the real downloaded file
  // there rather than teaching the shared validator script a one-off flag.
  const repoRoot = path.resolve(here, '..');
  const outDir = path.join(repoRoot, 'out');
  const originalPdf = path.join(outDir, 'invoice.pdf');
  const backupPdf = path.join(outDir, 'invoice.pdf.e2e-bak');
  const hadOriginal = (() => {
    try {
      copyFileSync(originalPdf, backupPdf);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    copyFileSync(pdfPath, originalPdf);
    // tools/py.mjs is this repo's own cross-platform Python launcher (`py`
    // on Windows, `python3` elsewhere) — reused here rather than
    // hardcoding an interpreter name, exactly like the root "validate" npm
    // script does.
    execFileSync('node', [path.join(repoRoot, 'tools', 'py.mjs'), path.join(repoRoot, 'tools', 'validate.py')], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } finally {
    if (hadOriginal) {
      copyFileSync(backupPdf, originalPdf);
      rmSync(backupPdf);
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

/**
 *  "a new e2e assertion that
 * the live preview reflects an edit within 500ms." Measures from the moment
 * the field edit lands (Playwright's fill() resolves) to the moment the
 * preview canvas has actually painted the new page — canvas.dataset.
 * renderedGeneration (InvoicePreview.tsx) only gets set after the full
 * build-PDF -> pdf.js render -> blit-to-visible-canvas pipeline completes,
 * so it's a real completion signal, not a proxy for one.
 */
test('live preview reflects an edit within 500ms', async ({ page }) => {
  await page.goto('/');

  const discardBtn = page.getByRole('button', { name: /discard it and start a new invoice/i });
  if (await discardBtn.isVisible().catch(() => false)) {
    await discardBtn.click();
  }

  const canvas = page.locator('.preview-panel canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText(/Live preview — this is the PDF/i)).toBeVisible({ timeout: 10_000 });

  const before = await canvas.getAttribute('data-rendered-generation');

  const start = Date.now();
  await page.getByLabel('Currency').fill('USD');

  await expect.poll(() => canvas.getAttribute('data-rendered-generation'), { timeout: 2_000, intervals: [10] }).not.toBe(before);
  const elapsed = Date.now() - start;

  expect(elapsed).toBeLessThan(500);
});

/**
 * the project's own conventions: the live preview must have no browser
 * PDF-viewer toolbar and no "blob:..." identity — checked here rather than
 * just by construction (canvas + pdf.js instead of <iframe src="blob:...">)
 * because a regression back to an iframe would otherwise only be caught by
 * eyeballing a screenshot.
 */
test('live preview has no iframe/blob chrome', async ({ page }) => {
  await page.goto('/');
  const discardBtn = page.getByRole('button', { name: /discard it and start a new invoice/i });
  if (await discardBtn.isVisible().catch(() => false)) await discardBtn.click();

  await expect(page.locator('.preview-panel canvas')).toBeVisible();
  await expect(page.locator('.preview-panel iframe')).toHaveCount(0);
});

/**
 * the project's own conventions: "add a Playwright check that the
 * preview canvas has non-blank pixels ... at 1440px and 390px wide."
 */
for (const width of [1440, 390]) {
  test(`live preview canvas has real content at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const discardBtn = page.getByRole('button', { name: /discard it and start a new invoice/i });
    if (await discardBtn.isVisible().catch(() => false)) await discardBtn.click();

    if (width < 768) {
      await page.getByRole('tab', { name: 'Preview' }).click();
    }

    const canvas = page.locator('.preview-panel canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.getAttribute('data-rendered-generation'), { timeout: 10_000 }).not.toBeNull();

    const sample = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! < 250 || data[i + 1]! < 250 || data[i + 2]! < 250) nonWhite++;
      }
      return { nonWhite, total: c.width * c.height };
    });
    expect(sample.nonWhite).toBeGreaterThan(0);
    // Not "any non-white pixel" alone — a single stray pixel would pass that
    // and still be a blank-looking page. A real invoice page (header, table
    // lines, totals) covers a real fraction of the canvas.
    expect(sample.nonWhite / sample.total).toBeGreaterThan(0.005);
  });
}
