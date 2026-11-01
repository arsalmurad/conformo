import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from './helpers.js';

const VALIDATOR = 'http://localhost:5184/';
test.use({ locale: 'en-US' });

/** A real XRechnung UBL document from the CLI, and a broken copy without the buyer reference (BR-DE-15). */
function xrechnungUbl(): string {
  return execFileSync(process.execPath, [path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'), path.join(repoRoot, 'packages/cli/src/cli.ts'),
    'create', path.join(repoRoot, 'fixtures/xrechnung-public-sector.json'), '--format', 'xrechnung-ubl'], { cwd: repoRoot, encoding: 'utf-8' });
}
const good = xrechnungUbl();
const bad = good.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, '');

async function choose(page: Page, name: string, content: string, mimeType = 'application/xml') {
  await page.locator('#file-input').setInputFiles({ name, mimeType, buffer: Buffer.from(content) });
}

test('validates on choose, with a plain verdict first and the rule sets under technical details', async ({ page }) => {
  await page.goto(VALIDATOR);
  await expect(page.getByRole('heading', { name: 'No invoice checked yet' })).toBeVisible();
  await choose(page, 'rechnung.xml', good);
  await expect(page.getByRole('heading', { name: 'Accepted under XRechnung 3.0' })).toBeVisible({ timeout: 20_000 });
  const tech = page.locator('#tech');
  await expect(tech).not.toHaveAttribute('open', '');
  await tech.locator('summary').click();
  await expect(tech).toContainText('EN 16931 (UBL)');
  await expect(tech).toContainText('XRechnung');
  await expect(tech).toContainText('XML schema (XSD) not checked in the browser');
  await expect(page.locator('body')).not.toContainText('[FATAL]');
});

test('a new file clears the previous result immediately and validates itself', async ({ page }) => {
  await page.goto(VALIDATOR);
  await choose(page, 'broken.xml', bad);
  await expect(page.getByRole('heading', { name: '1 problem will get this invoice rejected' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#fixes')).toContainText("Add your customer's Leitweg-ID.");
  await expect(page.locator('#fixes')).toContainText('BR-DE-15');

  await choose(page, 'rechnung.xml', good);
  // The old "1 problem" never sits next to the new file's name: the list is cleared before the new check runs.
  await expect(page.locator('#fixes li')).toHaveCount(0, { timeout: 1_000 });
  await expect(page.getByRole('heading', { name: 'Accepted under XRechnung 3.0' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#file-name')).toHaveText('rechnung.xml');
});

test('pasted XML is checked without pressing anything; a non-invoice is rejected, not "valid"', async ({ page }) => {
  await page.goto(VALIDATOR);
  await page.getByText('Or paste the XML').click();
  await page.getByLabel('Invoice XML').fill('<note><to>nobody</to></note>');
  await expect(page.getByRole('heading', { name: 'This is not an e-invoice we can read' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Invoice XML').fill(good);
  await expect(page.getByRole('heading', { name: 'Accepted under XRechnung 3.0' })).toBeVisible({ timeout: 20_000 });
});

test('German: the verdict and the fix are in German', async ({ page }) => {
  await page.goto(VALIDATOR);
  await page.getByRole('button', { name: 'DE' }).click();
  await choose(page, 'broken.xml', bad);
  await expect(page.getByRole('heading', { name: '1 Problem führt zur Ablehnung' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#fixes')).toContainText('Tragen Sie die Leitweg-ID Ihres Kunden ein.');
});
