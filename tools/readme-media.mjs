#!/usr/bin/env node
// Regenerates the pictures in docs/media that the README shows, from the real built sites, so they never drift from
// the product. Nothing here is drawn by hand.
//
//   npm run build --workspace=packages/ui && npm run validator-page:build
//   node tools/readme-media.mjs            # needs ffmpeg on PATH for the GIF
//
// Writes:
//   docs/media/app-demo.gif                an XRechnung for a German authority, filled in the real app until the
//                                          official rules accept it, then downloaded
//   docs/media/validator-light.png / -dark.png
//                                          the validator on a broken XRechnung: plain-language fixes with rule ids
//   docs/media/social-preview.png          1280x640 card for GitHub's "Social preview" setting
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/media');
fs.mkdirSync(out, { recursive: true });

const APP_PORT = 5283;
const VALIDATOR_PORT = 5284;
const servers = [
  spawn(process.execPath, [path.join(root, 'tools/serve-static.mjs'), path.join(root, 'packages/ui/dist'), String(APP_PORT)], { stdio: 'ignore' }),
  spawn(process.execPath, [path.join(root, 'tools/serve-static.mjs'), path.join(root, 'packages/validator-page/dist'), String(VALIDATOR_PORT)], { stdio: 'ignore' }),
];
const stop = () => servers.forEach((s) => s.kill());
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 800));
const APP = `http://127.0.0.1:${APP_PORT}/`;
const VALIDATOR = `http://127.0.0.1:${VALIDATOR_PORT}/`;

const browser = await chromium.launch();

// ------------------------------------------------------------------ helpers

/** A visible pointer, because Playwright's recordings have none and clicks would look like magic. */
const CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'><path d='M2 1l13 8-6 1.4L6 16z' fill='#111' stroke='#fff' stroke-width='1.4' stroke-linejoin='round'/></svg>";
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:0;top:0;width:20px;height:20px;margin:-2px 0 0 -2px;z-index:99999;pointer-events:none;' +
      'background:no-repeat center/contain url("data:image/svg+xml,${encodeURIComponent(CURSOR_SVG).replace(/'/g, '%27')}")';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  });`;

async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (b) await page.mouse.move(b.x + Math.min(b.width / 2, 60), b.y + b.height / 2, { steps: 12 });
}

async function smoothTo(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await page.waitForTimeout(450);
}

async function type(page, locator, text) {
  await pointAt(page, locator);
  await locator.click();
  await locator.pressSequentially(text, { delay: 18 });
}

const section = (page, id) => page.locator(`section[aria-labelledby="sec-${id}"]`);

// ------------------------------------------------------------------ 1. the app, as a GIF

/** The verdict and the finished invoice at the end of the demo, reused by the social card. */
let appAccepted;

async function appDemo() {
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-media-'));
  const size = { width: 1200, height: 760 };
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, locale: 'en-US', recordVideo: { dir: videoDir, size } });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.mouse.move(600, 380);
  const startMs = Date.now() - t0;
  await page.waitForTimeout(1400);

  const authority = page.getByRole('radio', { name: /A German public authority/ });
  await pointAt(page, authority);
  await authority.check();
  await page.waitForTimeout(700);

  const s = section(page, 'seller');
  await smoothTo(page, s.getByLabel('Business name'));
  await type(page, s.getByLabel('Business name'), 'Muster Software GmbH');
  await type(page, s.getByLabel('Street and number'), 'Hauptstrasse 1');
  await type(page, s.getByLabel('Postcode'), '10115');
  await type(page, s.getByLabel('City'), 'Berlin');
  await smoothTo(page, s.getByLabel('VAT ID', { exact: true }));
  await type(page, s.getByLabel('VAT ID', { exact: true }), 'DE123456789');
  await type(page, s.getByLabel('Email for e-invoices'), 'billing@muster.example');
  await smoothTo(page, s.getByLabel('Contact person'));
  await type(page, s.getByLabel('Contact person'), 'Erika Mustermann');
  await type(page, s.getByLabel('Contact phone'), '+49 30 1234567');
  await type(page, s.getByLabel('Contact email'), 'erika@muster.example');

  const b = section(page, 'buyer');
  await smoothTo(page, b.getByLabel("Customer's name"));
  await type(page, b.getByLabel("Customer's name"), 'Stadt Beispielhausen');
  await type(page, b.getByLabel('Street and number'), 'Ring 2');
  await type(page, b.getByLabel('Postcode'), '50667');
  await type(page, b.getByLabel('City'), 'Koeln');
  const leitweg = b.getByLabel("Your customer's Leitweg-ID");
  await smoothTo(page, leitweg);
  // A typo in the routing ID: the check digits catch it before the authority's portal does.
  await type(page, leitweg, '04011000-1234512345-07');
  await leitweg.blur();
  await b.getByText("This Leitweg-ID's check digits don't match.").waitFor();
  await page.waitForTimeout(1800);
  await pointAt(page, leitweg);
  await leitweg.click();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('6', { delay: 60 });
  await leitweg.blur();
  await page.waitForTimeout(700);

  const l = section(page, 'lines');
  await smoothTo(page, l.getByLabel('Invoice number'));
  await type(page, l.getByLabel('Invoice number'), 'RE-2027-0042');
  await smoothTo(page, l.getByLabel('Description').first());
  await type(page, l.getByLabel('Description').first(), 'Software maintenance, December');
  await l.getByLabel('Quantity').first().fill('');
  await type(page, l.getByLabel('Quantity').first(), '8');
  await l.getByLabel(/^Unit price \(net\)/).first().fill('');
  await type(page, l.getByLabel(/^Unit price \(net\)/).first(), '95');

  const p = section(page, 'payment');
  await smoothTo(page, p.getByLabel('IBAN'));
  await type(page, p.getByLabel('IBAN'), 'DE89370400440532013000');
  await p.getByLabel('IBAN').blur();

  // Back to the top, where the verdict sits next to the invoice: this is the moment the GIF is for.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.getByRole('heading', { name: 'Accepted under XRechnung 3.0' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2600);
  const download = page.getByRole('button', { name: 'Download e-invoice (PDF)' });
  await pointAt(page, download);
  await page.waitForTimeout(300);
  const pending = page.waitForEvent('download');
  await download.click();
  await pending;
  await page.waitForTimeout(1800);
  const endMs = Date.now() - t0;
  // For the social card: the verdict above the finished invoice, without the layout toolbar between them. This
  // happens after endMs, so the GIF never shows it.
  await page.addStyleTag({ content: '.preview-bar { display: none !important; }' });
  await page.waitForTimeout(150);
  appAccepted = await page.locator('.preview-col').screenshot({ type: 'png', scale: 'device' });

  const video = page.video();
  await ctx.close();
  const webm = await video.path();

  // Two-pass palette GIF: crisp text, small file. Skips the blank first frames before the app had painted.
  const gif = path.join(out, 'app-demo.gif');
  const start = (startMs / 1000).toFixed(2);
  const length = ((endMs - startMs) / 1000).toFixed(2);
  const vf = 'setpts=PTS/1.5,fps=8,scale=960:-1:flags=lanczos';
  const palette = path.join(videoDir, 'palette.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-t', length, '-i', webm, '-vf', `${vf},palettegen=max_colors=64:stats_mode=diff`, palette]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-t', length, '-i', webm, '-i', palette, '-lavfi',
    `${vf}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', gif]);
  fs.rmSync(videoDir, { recursive: true, force: true });
  console.log(`app-demo.gif  ${(fs.statSync(gif).size / 1e6).toFixed(2)} MB`);
}

// ------------------------------------------------------------------ 2. the validator on a broken invoice

function brokenXRechnung() {
  const good = execFileSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'packages/cli/src/cli.ts'),
    'create', path.join(root, 'fixtures/xrechnung-public-sector.json'), '--format', 'xrechnung-ubl'], { cwd: root, encoding: 'utf-8' });
  // Two mistakes people really make with authorities: no Leitweg-ID (BR-DE-15) and no contact phone (BR-DE-6).
  const bad = good
    .replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, '')
    .replace(/<cbc:Telephone>[^<]*<\/cbc:Telephone>/, '');
  if (bad === good) throw new Error('the broken copy is identical to the original');
  return bad;
}

async function validatorShots() {
  const xml = brokenXRechnung();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2, locale: 'en-US', colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(VALIDATOR, { waitUntil: 'networkidle' });
    await page.locator('#file-input').setInputFiles({ name: 'rechnung-2026-0815.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.getByRole('heading', { name: /problems? will get this invoice rejected/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    // Just the input and the verdict: the plain-language fixes are the point.
    const box = await page.locator('.vp-grid').boundingBox();
    const file = path.join(out, `validator-${scheme}.png`);
    await page.screenshot({ path: file, clip: { x: box.x - 24, y: box.y - 24, width: box.width + 48, height: box.height + 48 } });
    console.log(`validator-${scheme}.png  ${(await page.locator('#result-title').textContent()).trim()}`);
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 3. the social preview card

async function socialPreview() {
  if (!appAccepted) throw new Error('the social card reuses the end of the app demo: run without arguments, or with "gif social"');
  const shot = appAccepted.toString('base64');
  const font = (f) => fs.readFileSync(path.join(root, 'assets/fonts', f)).toString('base64');
  const card = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await card.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: W; src: url(data:font/ttf;base64,${font('WorkSans-Regular.ttf')}); font-weight: 400; }
    @font-face { font-family: W; src: url(data:font/ttf;base64,${font('WorkSans-Bold.ttf')}); font-weight: 700; }
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 640px; background: #eef1ee; color: #17211d; font-family: W, sans-serif; padding: 72px 80px; position: relative; overflow: hidden; }
    .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 34px; }
    .mark { width: 30px; height: 30px; border-radius: 50%; border: 6px solid #0e6a4e; position: relative; }
    .mark::after { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: #0e6a4e; }
    h1 { margin-top: 44px; font-size: 58px; line-height: 1.06; letter-spacing: -0.02em; max-width: 620px; }
    p { margin-top: 26px; font-size: 25px; line-height: 1.4; color: #3d4744; max-width: 580px; }
    .facts { position: absolute; left: 80px; bottom: 64px; display: flex; gap: 12px; }
    .facts span { font-size: 21px; font-weight: 700; padding: 10px 16px; border: 2px solid #17211d; border-radius: 4px; }
    .shot { position: absolute; right: 56px; top: 64px; width: 500px; box-shadow: 0 24px 60px rgba(23,33,29,.18); border-radius: 6px; }
  </style></head><body>
    <div class="brand"><span class="mark"></span>Conformo</div>
    <h1>Free e-invoices, checked against the official rules</h1>
    <p>XRechnung, ZUGFeRD and Factur-X. Create and check them in your browser, or with one npm package.</p>
    <div class="facts"><span>100% KoSIT agreement</span><span>No Java</span><span>Nothing uploaded</span></div>
    <img class="shot" src="data:image/png;base64,${shot}">
  </body></html>`);
  await card.waitForTimeout(200);
  await card.screenshot({ path: path.join(out, 'social-preview.png') });
  await card.close();
  console.log('social-preview.png');
}

try {
  const only = process.argv.slice(2);
  const want = (k) => only.length === 0 || only.includes(k);
  if (want('gif') || want('social')) await appDemo();
  if (want('validator')) await validatorShots();
  if (want('social')) await socialPreview();
} finally {
  await browser.close();
  stop();
}
