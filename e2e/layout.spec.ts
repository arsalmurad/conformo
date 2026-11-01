import { test, expect, type Page } from '@playwright/test';
import { openApp, section } from './helpers.js';

/**
 * At the widths people actually use: no input narrower than 120px (the old line description rendered 16px wide at
 * 1366px), nothing sticking out of its container, and no horizontal page scroll.
 */
test.use({ locale: 'en-US' });

const WIDTHS = [375, 768, 1366, 1920];

async function measure(page: Page) {
  return page.evaluate(() => {
    const narrow: string[] = [];
    const overflowing: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}#${el.id || ''}[${(el as HTMLInputElement).name || el.getAttribute('data-field') || ''}]`;
    const fields = document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]):not([type=hidden]), select, textarea');
    for (const el of Array.from(fields)) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120) narrow.push(`${name(el)} ${Math.round(r.width)}px`);
      // Contained by its nearest field/section/line container.
      const box = el.closest('.line, .section, .field, .seal, .more-panel, .vp-grid > section, .preview-tools') ?? document.body;
      const b = box.getBoundingClientRect();
      if (r.right > b.right + 1 || r.left < b.left - 1) overflowing.push(`${name(el)} ${Math.round(r.left)}..${Math.round(r.right)} outside ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!visible(el)) continue;
      if (el.closest('.visually-hidden, .file-input-hidden, .skip-link, datalist')) continue;
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1) overflowing.push(`${name(el)} right edge ${Math.round(r.right)} > viewport ${window.innerWidth}`);
    }
    return { narrow, overflowing: [...new Set(overflowing)].slice(0, 20), scroll: document.documentElement.scrollWidth - window.innerWidth };
  });
}

for (const width of WIDTHS) {
  test(`app at ${width}px: inputs at least 120px, nothing overflows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await page.getByRole('radio', { name: /A German public authority/ }).check();
    // Second line, an exempt line (shows the reason field) and the extras.
    await section(page, 'lines').getByRole('button', { name: /Add a line/ }).click();
    await section(page, 'lines').getByLabel('VAT', { exact: true }).nth(1).selectOption('E');
    await page.getByText('Notes and extras').click();
    // Reveal every error at once: messages must not push anything out of place.
    await page.getByRole('button', { name: /^(Fill in|Fix) \d+/ }).click();
    const m = await measure(page);
    expect(m.narrow).toEqual([]);
    expect(m.overflowing).toEqual([]);
    expect(m.scroll).toBeLessThanOrEqual(0);

    await page.locator('.more-menu > summary').click();
    const menu = await measure(page);
    expect(menu.narrow).toEqual([]);
    expect(menu.overflowing).toEqual([]);
  });

  test(`validator at ${width}px: nothing overflows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(process.env.VALIDATOR_URL ?? 'http://localhost:5184/');
    await page.getByText('Or paste the XML').click();
    const m = await measure(page);
    expect(m.narrow).toEqual([]);
    expect(m.overflowing).toEqual([]);
    expect(m.scroll).toBeLessThanOrEqual(0);
  });
}
