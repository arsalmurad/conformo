import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPdf, createXml, convert, explainRule, FORMAT_IDS, getRequirements, InvoiceInputError, parse, validate } from '@conformo/toolkit';
import type { Invoice } from '@conformo/toolkit';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf-8')) as Invoice;
const german = fx('xrechnung-public-sector.json');

describe('toolkit: create -> validate for every format', () => {
  for (const format of FORMAT_IDS) {
    it(`${format} output validates clean`, async () => {
      const inv = format === 'peppol-ubl' ? fx('peppol-belgium-full.json') : german;
      const { xml } = createXml(inv, format);
      const r = await validate(xml);
      expect(r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal').map((x) => x.ruleId)).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
  it('a bad model throws InvoiceInputError with every issue', () => {
    expect(() => createXml({} as Invoice, 'cii')).toThrow(InvoiceInputError);
  });
});

describe('toolkit: hybrid PDFs per profile', () => {
  for (const [profile, name, level] of [['en16931', 'factur-x.xml', 'EN 16931'], ['xrechnung', 'xrechnung.xml', 'XRECHNUNG'], ['extended', 'factur-x.xml', 'EXTENDED']] as const) {
    it(`${profile}: embeds ${name}, declares ${level}, and the embedded XML validates`, async () => {
      const out = await createPdf(german, { profile });
      expect(out.xmlFilename).toBe(name);
      expect(out.conformanceLevel).toBe(level);
      const text = Buffer.from(out.pdf).toString('latin1');
      expect(text).toContain(`<fx:ConformanceLevel>${level}</fx:ConformanceLevel>`);
      expect(text).toContain(`<fx:DocumentFileName>${name}</fx:DocumentFileName>`);
      const r = await validate(out.pdf);
      expect(r.origin).toBe('pdf');
      expect(r.embeddedFilename).toBe(name);
      expect(r.valid, JSON.stringify(r.results.filter((x) => x.severity === 'error').slice(0, 3))).toBe(true);
      expect(r.detected.profile).toBe(profile === 'xrechnung' ? 'xrechnung' : profile === 'extended' ? 'extended' : 'en16931');
    });
  }
  it('is deterministic: the same invoice gives byte-identical PDFs', async () => {
    const a = await createPdf(german, { profile: 'xrechnung' });
    const b = await createPdf(german, { profile: 'xrechnung' });
    expect(Buffer.compare(Buffer.from(a.pdf), Buffer.from(b.pdf))).toBe(0);
  });
});

describe('toolkit: parse, convert, explain, requirements', () => {
  it('converts XRechnung CII to UBL and back to the same model', async () => {
    const cii = createXml(german, 'xrechnung-cii').xml;
    const ubl = await convert(cii, 'xrechnung-ubl');
    expect(ubl.from).toBe('cii');
    const back = await parse(ubl.xml);
    expect(back.format).toBe('ubl-invoice');
    expect(back.invoice.number).toBe(german.number);
    expect((await validate(ubl.xml)).valid).toBe(true);
  });
  it('parses a hybrid PDF and checks its visible totals', async () => {
    const { pdf } = await createPdf(german);
    const p = await parse(pdf);
    expect(p.origin).toBe('pdf');
    expect(p.invoice.number).toBe(german.number);
    expect(p.visibleTotals).toBeDefined();
  });
  it('explains a rule with the publisher text and a plain-language note', () => {
    const e = explainRule('BR-CO-15');
    expect(e.found).toBe(true);
    expect(e.official[0]!.text).toMatch(/total amount with VAT/i);
    expect(e.plainLanguage?.fix).toBeTruthy();
    expect(explainRule('BR-DE-15').official.length).toBeGreaterThan(0);
    expect(explainRule('NOT-A-RULE').found).toBe(false);
  });
  it('returns requirements and says what Conformo supports', () => {
    const de = getRequirements('de')!;
    expect(de.country).toBe('DE');
    expect(de.conformoSupport['xrechnung']!.generate).toBe(true);
    expect(getRequirements('IT')!.conformoSupport['fatturapa']).toMatchObject({ generate: false, validate: false });
    expect(getRequirements('ZZ')).toBeUndefined();
  });
});
