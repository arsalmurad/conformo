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
 * preview iframe points at a new PDF (a new blob: URL — InvoicePreview only
 * assigns one once buildInvoicePdf() has actually produced fresh bytes) —
 * the most literal reading of "reflects an edit" available, since the iframe
 * shows the exact PDF the download button would produce, not a re-rendering
 * of it.
 */
test('live preview reflects an edit within 500ms', async ({ page }) => {
  await page.goto('/');

  const discardBtn = page.getByRole('button', { name: /discard it and start a new invoice/i });
  if (await discardBtn.isVisible().catch(() => false)) {
    await discardBtn.click();
  }

  const frame = page.locator('.preview-panel iframe');
  await expect(frame).toBeVisible();
  await expect(page.getByText(/Live preview — this is the PDF/i)).toBeVisible({ timeout: 10_000 });

  const before = await frame.getAttribute('src');

  const start = Date.now();
  await page.getByLabel('Currency').fill('USD');

  await expect.poll(() => frame.getAttribute('src'), { timeout: 2_000, intervals: [10] }).not.toBe(before);
  const elapsed = Date.now() - start;

  expect(elapsed).toBeLessThan(500);
});
