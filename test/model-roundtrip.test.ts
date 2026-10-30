import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCII, buildUBL } from '@conformo/formats';
import { detectXmlFormat } from '@conformo/parse';
import { validate } from '@conformo/validate';
import type { Invoice } from '@conformo/core';

const load = (f: string) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf-8')) as Invoice;

/** Drops keys whose value is undefined so toEqual compares what is on the wire. */
const clean = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

for (const fx of ['full-model.json', 'full-model-b.json']) describe(`every EN 16931 business term survives a write -> read round trip, in both syntaxes (${fx})`, () => {
  const full = load(fx);
  for (const [name, build] of [['CII', (i: Invoice) => buildCII(i)], ['UBL', (i: Invoice) => buildUBL(i)]] as const) {
    it(`${name}: reading back what was written gives the same model`, () => {
      const back = clean(detectXmlFormat(build(full)).invoice) as Invoice;
      const want = clean(full) as Invoice;
      // Defaults the writer fills in (see readCII.ts header): line id/unit code are explicit in this fixture or defaulted.
      for (const l of back.lines) if (!want.lines.some((w) => w.name === l.name)) throw new Error('line lost');
      back.lines.forEach((l, i) => {
        want.lines[i]!.unitCode ??= 'C62';
      });
      expect(back).toEqual(want);
    });

    it(`${name}: passes XSD + EN 16931 Schematron`, async () => {
      const r = await validate(build(full));
      expect(r.xsd).toMatchObject({ ran: true, valid: true });
      expect(r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal'), JSON.stringify(r.results.slice(0, 5))).toEqual([]);
    });
  }
});
