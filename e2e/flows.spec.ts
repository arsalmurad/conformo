import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { downloadVia, fillLine, fillParty, openApp, section, verifyPdf } from './helpers.js';

/**
 * The four answers to "Who is this invoice for?", each filled through the real UI, downloaded, and checked the way a
 * receiver would check it: the embedded XML is extracted from the downloaded PDF and run through the official rule
 * sets in Node (EN 16931 always; KoSIT XRechnung for the authority; the French CTC rules for France), and for the
 * German authority additionally through the official KoSIT validator in Java.
 */
test.use({ locale: 'en-US' });

const IBAN_DE = 'DE89370400440532013000';
const sellerDE = { name: 'Muster Software GmbH', street: 'Hauptstrasse 1', postcode: '10115', city: 'Berlin', country: 'Germany', vatId: 'DE123456789' };
const buyerDE = { name: 'Beispiel Handel GmbH', street: 'Ring 2', postcode: '50667', city: 'Koeln', country: 'Germany' };

test('a business in Germany: ZUGFeRD EN 16931, passes the EN 16931 rules', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: /A business in Germany/ }).check();
  await fillParty(page, 'seller', sellerDE);
  await fillParty(page, 'buyer', buyerDE);
  await section(page, 'lines').getByLabel('Invoice number').fill('E2E-DE-0001');
  await fillLine(page, { name: 'Website design', quantity: '1', price: '1000' });
  await expect(section(page, 'lines').getByLabel('VAT %')).toHaveValue('19');
  await section(page, 'payment').getByLabel('IBAN').fill(IBAN_DE);

  await expect(page.getByRole('heading', { name: 'Accepted under ZUGFeRD (EN 16931)' })).toBeVisible({ timeout: 20_000 });
  const file = await downloadVia(page, page.getByRole('button', { name: 'Download e-invoice (PDF)' }));
  const v = verifyPdf(file);
  expect(v.failures).toEqual([]);
  expect(v.valid).toBe(true);
  expect(v.filename).toBe('factur-x.xml');
  expect(v.conformance).toBe('EN 16931');
  expect(v.ruleSets).toEqual(['en16931-cii']);
});

test('a German public authority: XRechnung 3.0, passes KoSIT in the browser, in Node and in the official Java validator', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: /A German public authority/ }).check();
  await fillParty(page, 'seller', { ...sellerDE, email: 'rechnung@muster-software.example' });
  const seller = section(page, 'seller');
  await seller.getByLabel('Contact person').fill('Erika Mustermann');
  await seller.getByLabel('Contact phone').fill('+49 30 1234567');
  await seller.getByLabel('Contact email').fill('erika@muster-software.example');
  await fillParty(page, 'buyer', { ...buyerDE, name: 'Stadt Beispielhausen' });
  const leitweg = section(page, 'buyer').getByLabel("Your customer's Leitweg-ID");
  await leitweg.fill('04011000-1234512345-07');
  await leitweg.blur();
  await expect(section(page, 'buyer').getByText("This Leitweg-ID's check digits don't match.")).toBeVisible();
  await leitweg.fill('04011000-1234512345-06');
  // The authority's e-invoice address follows the Leitweg-ID (EAS 0204).
  await expect(section(page, 'buyer').getByLabel("Customer's e-invoice address")).toHaveValue('04011000-1234512345-06');
  await section(page, 'lines').getByLabel('Invoice number').fill('E2E-B2G-0001');
  await fillLine(page, { name: 'Wartung Dezember', quantity: '8', price: '95' });
  await section(page, 'payment').getByLabel('IBAN').fill(IBAN_DE);

  await expect(page.getByRole('heading', { name: 'Accepted under XRechnung 3.0' })).toBeVisible({ timeout: 20_000 });
  const file = await downloadVia(page, page.getByRole('button', { name: 'Download e-invoice (PDF)' }));
  const v = verifyPdf(file, { country: 'DE', kosit: true });
  expect(v.failures).toEqual([]);
  expect(v.valid).toBe(true);
  expect(v.filename).toBe('xrechnung.xml');
  expect(v.conformance).toBe('XRECHNUNG');
  expect(v.ruleSets).toEqual(['en16931-cii', 'xrechnung-cii']);
  expect(v.kosit.ran).toBe(true);
  expect(v.kosit.accepted, v.kosit.report).toBe(true);
});

test('a business in France: Factur-X EN 16931, passes the EN 16931 and French CTC rules', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: /A business in France/ }).check();
  await fillParty(page, 'seller', { name: 'Atelier Exemple SARL', street: '12 Rue Exemple', postcode: '75004', city: 'Paris', country: 'France', vatId: 'FR32123456789', email: 'factures@atelier.example' });
  await section(page, 'seller').getByLabel('SIREN').fill('123456789');
  await fillParty(page, 'buyer', { name: 'Client Exemple SAS', street: '3 Avenue Test', postcode: '69002', city: 'Lyon', country: 'France', email: 'compta@client.example' });
  await section(page, 'lines').getByLabel('Invoice number').fill('E2E-FR-0001');
  await section(page, 'lines').getByLabel('What are you invoicing?').selectOption('S1');
  await fillLine(page, { name: 'Conseil', quantity: '2', price: '450' });
  await expect(section(page, 'lines').getByLabel('VAT %')).toHaveValue('20');
  await section(page, 'payment').getByLabel('IBAN').fill('FR7630006000011234567890189');
  // The three BR-FR-05 notices are pre-filled and editable.
  await expect(section(page, 'payment').getByLabel('Recovery fee')).toHaveValue(/40 EUR/);

  await expect(page.getByRole('heading', { name: 'Accepted under Factur-X (EN 16931) + BR-FR' })).toBeVisible({ timeout: 20_000 });
  const file = await downloadVia(page, page.getByRole('button', { name: 'Download e-invoice (PDF)' }));
  const v = verifyPdf(file, { country: 'FR' });
  expect(v.failures).toEqual([]);
  expect(v.valid).toBe(true);
  expect(v.filename).toBe('factur-x.xml');
  expect(v.conformance).toBe('EN 16931');
  expect(v.ruleSets).toEqual(['en16931-cii', 'fr-ctc']);
});

test('a business in another EU country: EN 16931, passes the EN 16931 rules', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: /A business in another EU country/ }).check();
  await fillParty(page, 'seller', { name: 'Beispiel Studio GmbH', street: 'Ringstrasse 5', postcode: '1010', city: 'Wien', country: 'Austria', vatId: 'ATU12345678' });
  await fillParty(page, 'buyer', { name: 'Voorbeeld BV', street: 'Kade 9', postcode: '1011 AB', city: 'Amsterdam', country: 'Netherlands' });
  await section(page, 'lines').getByLabel('Invoice number').fill('E2E-EU-0001');
  await fillLine(page, { name: 'Design', quantity: '3', price: '120,50' });
  // The seller is in Austria: a new standard-rated line defaults to Austria's standard rate.
  await expect(section(page, 'lines').getByLabel('VAT %')).toHaveValue('20');
  await section(page, 'payment').getByLabel('IBAN').fill('AT611904300234573201');

  await expect(page.getByRole('heading', { name: 'Accepted under EN 16931' })).toBeVisible({ timeout: 20_000 });
  const file = await downloadVia(page, page.getByRole('button', { name: 'Download e-invoice (PDF)' }));
  const v = verifyPdf(file);
  expect(v.failures).toEqual([]);
  expect(v.valid).toBe(true);
  expect(v.conformance).toBe('EN 16931');
});

test('an invoice that fails its rules cannot be downloaded as an e-invoice: "Fix" focuses the problem, a draft has no XML', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: /A German public authority/ }).check();
  await fillParty(page, 'seller', { ...sellerDE, email: 'rechnung@muster-software.example' });
  await fillParty(page, 'buyer', { ...buyerDE, name: 'Stadt Beispielhausen', email: 'eingang@stadt.example' });
  await section(page, 'lines').getByLabel('Invoice number').fill('E2E-GATE-0001');
  await fillLine(page, { name: 'Wartung', quantity: '1', price: '100' });
  await section(page, 'payment').getByLabel('IBAN').fill(IBAN_DE);

  // No Leitweg-ID, no seller contact: 4 required fields missing for XRechnung (BR-DE-15, BR-DE-2).
  const fix = page.getByRole('button', { name: /^(Fill in|Fix) \d+ (fields?|problems?)$/ });
  await expect(fix).toHaveText('Fill in 4 fields', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Download e-invoice (PDF)' })).toHaveCount(0);
  await fix.click();
  await expect(section(page, 'seller').getByLabel('Contact person')).toBeFocused();
  await expect(section(page, 'seller').getByText('Add a contact person.')).toBeVisible();
  await expect(section(page, 'buyer').getByText("Add your customer's Leitweg-ID.")).toBeVisible();

  const draft = page.getByRole('button', { name: 'Download draft (not valid for XRechnung 3.0)' });
  const file = await downloadVia(page, draft);
  const bytes = readFileSync(file);
  const text = bytes.toString('latin1');
  expect(text.startsWith('%PDF-')).toBe(true);
  // No embedded invoice XML and no Factur-X/XRechnung claim: a receiving system must not mistake it for an e-invoice.
  expect(text).not.toContain('/EmbeddedFiles');
  expect(text).not.toContain('xrechnung.xml');
  expect(text).not.toContain('ConformanceLevel');
  expect(() => verifyPdf(file, { country: 'DE' })).toThrow();
});

test('no errors before the user touches anything', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.field-msg-error')).toHaveCount(0);
  // The old first load showed checkInvoice's developer text ("Invalid invoice input (6 problems): - number [BT-1] ... got \"\"").
  expect(await page.locator('body').innerText()).not.toMatch(/Invalid invoice input|\[BT-\d+\]|got ""/);
  const name = section(page, 'seller').getByLabel('Business name');
  await name.focus();
  await name.blur();
  await expect(section(page, 'seller').getByText('Add your business name.')).toBeVisible();
});
