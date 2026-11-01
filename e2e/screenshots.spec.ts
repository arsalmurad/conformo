import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fillLine, fillParty, openApp, repoRoot, section } from './helpers.js';

/**
 * The screenshots in docs/screenshots, reviewed in docs/DESIGN.md. Not part of the e2e gate (playwright.config.ts
 * ignores it unless SCREENSHOTS=1), so the gate never rewrites committed files:
 *   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
test.use({ locale: 'de-DE' });

const WIDTHS = [375, 768, 1366, 1920];
const out = (name: string) => path.join(repoRoot, 'docs/screenshots', `${name}.png`);
const VALIDATOR = process.env.VALIDATOR_URL ?? 'http://localhost:5184/';

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: out(name), fullPage: false });
}

/** The German authority flow, half done: some fields left with errors showing. */
async function halfFilled(page: Page) {
  await page.getByRole('radio', { name: /An eine deutsche Behörde/ }).check();
  const s = section(page, 'seller');
  await s.getByLabel('Name Ihres Unternehmens').fill('Muster Software GmbH');
  await s.getByLabel('Straße und Hausnummer').fill('Hauptstraße 1');
  await s.getByLabel('PLZ').fill('10115');
  await s.getByLabel('Ort').fill('Berlin');
  await section(page, 'lines').getByLabel('Beschreibung').fill('Wartung Dezember');
  await section(page, 'lines').getByLabel(/^Einzelpreis/).fill('1.250,00');
  await page.getByRole('button', { name: /^(\d+ Angaben? fehl|\d+ Probleme? beheben)/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function valid(page: Page) {
  await page.getByRole('radio', { name: /An ein Unternehmen in Deutschland/ }).check();
  const s = section(page, 'seller');
  await s.getByLabel('Name Ihres Unternehmens').fill('Muster Software GmbH');
  await s.getByLabel('Straße und Hausnummer').fill('Hauptstraße 1');
  await s.getByLabel('PLZ').fill('10115');
  await s.getByLabel('Ort').fill('Berlin');
  await s.getByLabel('USt-IdNr.', { exact: true }).fill('DE123456789');
  const b = section(page, 'buyer');
  await b.getByLabel('Name des Kunden').fill('Beispiel Handel GmbH');
  await b.getByLabel('Straße und Hausnummer').fill('Ring 2');
  await b.getByLabel('PLZ').fill('50667');
  await b.getByLabel('Ort').fill('Köln');
  await section(page, 'lines').getByLabel('Rechnungsnummer').fill('RE-2026-0042');
  await section(page, 'lines').getByLabel('Beschreibung').fill('Webdesign Startseite');
  await section(page, 'lines').getByLabel('Menge').fill('12');
  await section(page, 'lines').getByLabel(/^Einzelpreis/).fill('95');
  await section(page, 'payment').getByLabel('IBAN').fill('DE89370400440532013000');
  await expect(page.getByRole('button', { name: 'E-Rechnung herunterladen (PDF)' })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

const ubl = () => execFileSync(process.execPath, [path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'), path.join(repoRoot, 'packages/cli/src/cli.ts'),
  'create', path.join(repoRoot, 'fixtures/xrechnung-public-sector.json'), '--format', 'xrechnung-ubl'], { cwd: repoRoot, encoding: 'utf-8' });

for (const width of WIDTHS) {
  test(`screenshots at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 860 : 900 });
    await openApp(page);
    await shoot(page, `app-${width}-empty`);
    await halfFilled(page);
    await shoot(page, `app-${width}-errors`);
    if (width < 900) {
      await page.getByRole('button', { name: /^Vorschau/ }).click();
      await shoot(page, `app-${width}-errors-preview`);
    }
    await openApp(page);
    await valid(page);
    if (width < 900) await page.getByRole('button', { name: /^Vorschau/ }).click();
    await shoot(page, `app-${width}-valid`);

    const good = ubl();
    await page.goto(VALIDATOR);
    await page.locator('#file-input').setInputFiles({ name: 'rechnung.xml', mimeType: 'application/xml', buffer: Buffer.from(good) });
    await expect(page.getByRole('heading', { name: /Gültig nach/ })).toBeVisible({ timeout: 20_000 });
    await shoot(page, `validator-${width}-valid`);
    const bad = good.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, '').replace(/<cbc:Telephone>[^<]*<\/cbc:Telephone>/, '');
    await page.locator('#file-input').setInputFiles({ name: 'rechnung-fehlerhaft.xml', mimeType: 'application/xml', buffer: Buffer.from(bad) });
    await expect(page.getByRole('heading', { name: /führ(t|en) zur Ablehnung/ })).toBeVisible({ timeout: 20_000 });
    await shoot(page, `validator-${width}-invalid`);
  });
}
