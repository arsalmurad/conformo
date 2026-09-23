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
});
