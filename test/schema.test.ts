import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { invoiceSchema, invoiceJsonSchema, invoiceJsonSchemaText } from '@conformo/schema';
import type { Invoice } from '@conformo/core';

const fixturesDir = path.join(process.cwd(), 'fixtures');
const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
const readFixture = (f: string): unknown => JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf8'));

describe('@conformo/schema', () => {
  it('has fixtures to test', () => expect(fixtureFiles.length).toBeGreaterThan(5));

  for (const f of fixtureFiles) {
    it(`fixtures/${f} parses`, () => {
      const r = invoiceSchema.safeParse(readFixture(f));
      expect(r.success, r.success ? '' : JSON.stringify(r.error.issues, null, 2)).toBe(true);
    });
  }

  it('does not strip anything: parsing returns the same data', () => {
    for (const f of fixtureFiles) {
      const data = readFixture(f);
      expect(invoiceSchema.parse(data)).toEqual(data);
    }
  });

  it('every key of the Invoice-typed full-model.json fixture is known to the schema (no silent strip)', () => {
    const full = readFixture('full-model.json') as Invoice;
    // The strict() schema rejects an unknown key anywhere; the fixture must pass, and a typo must not.
    expect(invoiceSchema.safeParse(full).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...full, bogusField: 1 }).success).toBe(false);
    const nested = structuredClone(full) as unknown as { seller: Record<string, unknown> };
    nested.seller.bogus = 'x';
    expect(invoiceSchema.safeParse(nested).success).toBe(false);
    const keys = new Set(Object.keys((invoiceSchema as unknown as { shape: object }).shape));
    for (const k of Object.keys(full)) expect(keys.has(k), `top-level key ${k}`).toBe(true);
  });

  it('bad input gives readable errors with paths', () => {
    const r = invoiceSchema.safeParse({
      number: 7, issueDate: '14/09/2026', currency: 'eur',
      seller: { name: 'A', country: 'Germany' }, buyer: { name: 'B' },
      lines: [{ name: 'x', quantity: 1, unitPriceMinor: 10, taxCategory: 'X', taxRate: 19, allowances: [{ amountMinor: 1.5 }] }],
      surprise: true,
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const byPath = new Map(r.error.issues.map((i) => [i.path.join('.'), i.message]));
    expect(byPath.get('number')).toMatch(/string/i);
    expect(byPath.get('issueDate')).toMatch(/yyyy-mm-dd/);
    expect(byPath.get('currency')).toMatch(/ISO 4217/);
    expect(byPath.get('seller.country')).toMatch(/alpha-2/);
    expect(byPath.get('buyer.country')).toBeDefined();
    expect(byPath.get('lines.0.taxCategory')).toMatch(/Invalid enum value/);
    expect(byPath.get('lines.0.allowances.0.amountMinor')).toMatch(/integer/i);
    expect(r.error.issues.some((i) => /Unrecognized key/.test(i.message) && /surprise/.test(i.message))).toBe(true);
  });

  it('money must be integer minor units', () => {
    const base = readFixture('sample-invoice.json') as Invoice;
    expect(invoiceSchema.safeParse({ ...base, prepaidMinor: 10.5 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...base, prepaidMinor: 10 }).success).toBe(true);
  });

  it('every property in the JSON Schema carries a description naming its BT/BG (or explaining itself)', () => {
    const missing: string[] = [];
    const walk = (node: unknown, where: string): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as { properties?: Record<string, { description?: string }>; items?: unknown };
      for (const [k, v] of Object.entries(n.properties ?? {})) {
        if (!v.description) missing.push(`${where}.${k}`);
        walk(v, `${where}.${k}`);
      }
      if (n.items) walk(n.items, `${where}[]`);
    };
    walk(invoiceJsonSchema, 'invoice');
    expect(missing).toEqual([]);
  });

  it('JSON Schema marks required fields and forbids unknown keys', () => {
    const s = invoiceJsonSchema as unknown as { required: string[]; additionalProperties: unknown };
    expect(s.required).toEqual(expect.arrayContaining(['number', 'issueDate', 'currency', 'seller', 'buyer', 'lines']));
    expect(s.additionalProperties).toBe(false);
  });

  it('packages/schema/invoice.schema.json is up to date (run: npm run schema:generate)', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), 'packages', 'schema', 'invoice.schema.json'), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(invoiceJsonSchemaText);
  });
});
