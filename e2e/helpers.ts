import { expect, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function openApp(page: Page) {
  await page.goto('/');
  const discard = page.getByRole('button', { name: /discard it and start a new invoice/i });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await expect(page.getByRole('group', { name: 'Who is this invoice for?' })).toBeVisible();
}

export const section = (page: Page, id: 'seller' | 'buyer' | 'lines' | 'payment') => page.locator(`section[aria-labelledby="sec-${id}"]`);

export async function fillCountry(scope: Locator, name: string) {
  const input = scope.getByLabel('Country', { exact: true });
  await input.fill(name);
  await input.blur();
}

export interface PartyData {
  name: string; street: string; postcode: string; city: string; country: string; vatId?: string; email?: string;
}

export async function fillParty(page: Page, side: 'seller' | 'buyer', d: PartyData) {
  const s = section(page, side);
  await s.getByLabel(side === 'seller' ? 'Business name' : "Customer's name").fill(d.name);
  await s.getByLabel('Street and number').fill(d.street);
  await s.getByLabel('Postcode').fill(d.postcode);
  await s.getByLabel('City').fill(d.city);
  await fillCountry(s, d.country);
  if (d.vatId) await s.getByLabel(side === 'seller' ? 'VAT ID' : "Customer's VAT ID", { exact: true }).fill(d.vatId);
  if (d.email) await s.getByLabel(side === 'seller' ? 'Email for e-invoices' : "Customer's e-invoice address").fill(d.email);
}

export async function fillLine(page: Page, d: { name: string; quantity: string; price: string }) {
  const s = section(page, 'lines');
  await s.getByLabel('Description').first().fill(d.name);
  await s.getByLabel('Quantity').first().fill(d.quantity);
  await s.getByLabel(/^Unit price \(net\)/).first().fill(d.price);
}

export async function downloadVia(page: Page, button: Locator): Promise<string> {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const dir = mkdtempSync(path.join(tmpdir(), 'conformo-e2e-'));
  const file = path.join(dir, download.suggestedFilename());
  await download.saveAs(file);
  return file;
}

export interface Verified {
  filename: string;
  conformance?: string;
  profile: string;
  valid: boolean;
  ruleSets: string[];
  failures: string[];
  kosit: { ran: boolean; accepted?: boolean; report?: string };
}

/** Extracts the embedded XML and runs the official rule sets in Node (tools/verify-invoice-pdf.ts). */
export function verifyPdf(file: string, opts: { country?: 'DE' | 'FR'; kosit?: boolean } = {}): Verified {
  const args = [path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'), path.join(repoRoot, 'tools/verify-invoice-pdf.ts'), file];
  if (opts.country) args.push('--country', opts.country);
  if (opts.kosit) args.push('--kosit');
  const out = execFileSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf-8', maxBuffer: 1 << 26 });
  return JSON.parse(out.trim().split('\n').pop()!) as Verified;
}
