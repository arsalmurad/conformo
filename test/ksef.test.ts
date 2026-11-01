import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildKsefFa3, InvoiceInputError } from '@conformo/formats';
import { createXml } from '@conformo/toolkit';
import { totals } from '@conformo/core';
import { validate } from '@conformo/validate';
import type { Invoice } from '@conformo/core';

const pl = JSON.parse(readFileSync(new URL('../fixtures/ksef-pl-domestic.json', import.meta.url), 'utf-8')) as Invoice;

describe('KSeF FA(3): generation and schema validation (no submission)', () => {
  it('writes a document the Ministry of Finance schema accepts', async () => {
    const xml = buildKsefFa3(pl);
    const r = await validate(xml);
    expect(r.xsd, JSON.stringify(r.xsd.errors)).toMatchObject({ ran: true, valid: true, schema: expect.stringContaining('KSeF FA(3)') });
    expect(r.valid).toBe(true);
    expect(r.ruleSets).toEqual([]);                                       // nothing but the schema is checked, and it says so
    expect(r.notices.map((n) => n.code)).toContain('KSEF-SCHEMA-ONLY');
  });
  it('carries the totals of the model', () => {
    const xml = buildKsefFa3(pl);
    expect(xml).toContain(`<P_15>${(totals(pl).grand / 100).toFixed(2)}</P_15>`);
    expect(xml).toContain('<P_12>zw</P_12>');
    expect(xml).toContain('<P_13_6_1>');
  });
  it('is deterministic and reachable through the toolkit', () => {
    expect(buildKsefFa3(pl)).toBe(buildKsefFa3(pl));
    expect(createXml(pl, 'ksef-fa3').xml).toBe(buildKsefFa3(pl));
  });
  it('the schema rejects a broken document, so a pass means something', async () => {
    const r = await validate(buildKsefFa3(pl).replace(/<P_15>[^<]*<\/P_15>/, '<P_15>abc</P_15>'));
    expect(r.valid).toBe(false);
    expect(r.xsd.valid).toBe(false);
  });
  it('refuses what it cannot write correctly instead of guessing', () => {
    const cases: [string, Invoice][] = [
      ['foreign currency', { ...pl, currency: 'EUR' }],
      ['credit note', { ...pl, typeCode: '381' }],
      ['reverse charge', { ...pl, lines: [{ ...pl.lines[0]!, taxCategory: 'AE', taxRate: 0 }] }],
      ['no Polish NIP', { ...pl, seller: { ...pl.seller, vatId: 'DE123456789', taxRegistrationId: undefined } }],
    ];
    for (const [name, inv] of cases) {
      expect(() => buildKsefFa3(inv), name).toThrow(InvoiceInputError);
    }
  });
});
