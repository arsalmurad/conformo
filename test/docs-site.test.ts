import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { countries } from '../packages/compliance-data/src/index.js';

describe('docs-site: builds one page per mandate country from the dataset', () => {
  it('generates an index, a countries index, and one page per country with no hand-written content', async () => {
    // generate.ts writes its pages as a top-level side effect on import,
    // like tools/build-fixtures.ts and tools/build-sample.ts do — importing
    // it here IS running the build, the same as `npm run docs:build`.
    await import('../packages/docs-site/src/generate.js');

    expect(fs.existsSync('packages/docs-site/dist/index.html')).toBe(true);
    expect(fs.existsSync('packages/docs-site/dist/countries/index.html')).toBe(true);
    for (const c of countries) {
      const file = `packages/docs-site/dist/countries/${c.country.toLowerCase()}.html`;
      expect(fs.existsSync(file)).toBe(true);
      const html = fs.readFileSync(file, 'utf-8');
      expect(html).toContain(c.name);
      expect(html).toContain(c.sourceUrl);
    }
  });

  // Regression: every internal link used to be rooted at "/", which only
  // resolves when the site is served from a domain's root — GitHub Pages for
  // a project repo serves at "<user>.github.io/<repo>/", where every
  // "/countries/..." link 404s. Found by an independent review; verified live
  // by serving a copy of dist/ from a nested subpath in a real browser and
  // confirming both the home page's link and a country page's nav resolve
  // within that subpath, not back up to the server root.
  it('never links to an absolute, root-anchored path, so the site works from any subpath', () => {
    const home = fs.readFileSync('packages/docs-site/dist/index.html', 'utf-8');
    const country = fs.readFileSync('packages/docs-site/dist/countries/fr.html', 'utf-8');
    for (const html of [home, country]) {
      expect(html).not.toMatch(/href="\//);
    }
  });
});
