import { describe, it, expect } from 'vitest';
import type { Invoice } from '@conformo/core';
import { buildCII } from '@conformo/formats';
import { validate } from '@conformo/validate';
import { AUDIENCES, applyAudience, type AudienceId } from '../packages/ui/src/audience.js';
import { clientProblems, keyForRule, problemsFromRules } from '../packages/ui/src/validation/problems.js';
import { describe as describeProblem } from '../packages/ui/src/validation/messages.js';
import { emptyInvoice } from '../packages/ui/src/state/emptyInvoice.js';
import { normalizeDecimal, formatAmount, parseAmount } from '../packages/ui/src/money.js';

/** What the form produces for each audience once everything it asks for is filled in. */
function filled(id: AudienceId): Invoice {
  const a = AUDIENCES[id];
  const fr = id === 'fr-b2b';
  const inv = applyAudience(emptyInvoice(fr ? 'FR' : 'DE', fr ? 'FR' : 'DE'), a);
  return {
    ...inv,
    number: 'T-1',
    issueDate: '2026-11-01',
    buyerReference: id === 'de-b2g' ? '04011000-1234512345-06' : undefined,
    businessProcess: fr ? 'S1' : undefined,
    seller: {
      ...inv.seller, name: 'Seller', street: 'Street 1', postcode: fr ? '75004' : '10115', city: fr ? 'Paris' : 'Berlin',
      vatId: fr ? 'FR32123456789' : 'DE123456789', electronicAddress: 'billing@seller.example', electronicAddressScheme: 'EM',
      ...(fr ? { legalId: '123456789', legalIdScheme: '0002' } : {}),
      ...(id === 'de-b2g' ? { contact: { name: 'Ann', phone: '+49 30 1', email: 'ann@seller.example' } } : {}),
    },
    buyer: {
      ...inv.buyer, name: 'Buyer', street: 'Ring 2', postcode: fr ? '69002' : '50667', city: fr ? 'Lyon' : 'Koeln',
      electronicAddress: id === 'de-b2g' ? '04011000-1234512345-06' : 'ap@buyer.example', electronicAddressScheme: id === 'de-b2g' ? '0204' : 'EM',
    },
    payment: { meansCode: '58', iban: 'DE89370400440532013000' },
    lines: [{ ...inv.lines[0]!, name: 'Work', quantity: 2, unitPriceMinor: 5000 }],
  };
}

function blank(inv: Invoice, key: string): Invoice {
  const copy = structuredClone(inv) as unknown as Record<string, any>;
  if (key.startsWith('notes.')) { copy.notes = copy.notes.filter((n: { subjectCode?: string }) => n.subjectCode !== key.slice(6)); return copy as unknown as Invoice; }
  const parts = key.split('.');
  let o = copy;
  for (const p of parts.slice(0, -1)) o = o[p];
  delete o[parts.at(-1)!];
  if (key.endsWith('electronicAddress')) delete o.electronicAddressScheme;
  if (key === 'seller.legalId') delete o.legalIdScheme;
  return copy as unknown as Invoice;
}

async function run(inv: Invoice, id: AudienceId) {
  const a = AUDIENCES[id];
  return validate(buildCII(inv, { profile: a.profile }), a.country ? { country: a.country } : {});
}

describe('"Who is this invoice for?": each answer is accepted when the form is complete', () => {
  for (const id of Object.keys(AUDIENCES) as AudienceId[]) {
    it(`${id}: a complete form passes the official rule sets`, async () => {
      const r = await run(filled(id), id);
      expect(r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal').map((x) => `${x.ruleId} ${x.message}`)).toEqual([]);
      expect(r.valid).toBe(true);
      expect(clientProblems(filled(id), AUDIENCES[id])).toEqual([]);
    }, 30_000);
  }
});

describe('every field an audience marks required is demanded by the official rule it cites, and lands on that field', () => {
  for (const id of ['de-b2g', 'fr-b2b'] as AudienceId[]) {
    for (const f of AUDIENCES[id].required) {
      it(`${id}: ${f.key} (${f.rule})`, async () => {
        const inv = blank(filled(id), f.key);
        const r = await run(inv, id);
        const failing = r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal');
        const cited = failing.filter((x) => x.ruleId.split(/[_/]/)[0] === f.rule);
        expect(cited.map((x) => x.ruleId), failing.map((x) => x.ruleId).join(', ')).not.toEqual([]);
        expect(cited.map((x) => keyForRule(x, inv))).toContain(f.key);
        // The form says so before the Schematron runs, in plain words in both languages.
        const p = clientProblems(inv, AUDIENCES[id]).find((x) => x.key === f.key);
        expect(p?.kind).toBe('missing');
        for (const lang of ['en', 'de'] as const) expect(describeProblem(p!, lang).text).not.toMatch(/official check|offizielle Prüfung/);
      }, 30_000);
    }
  }
});

describe('official rule failures become plain field messages', () => {
  it('BR-DE-15 (KoSIT, German text) becomes "Add your customer\'s Leitweg-ID." on the Leitweg-ID field', async () => {
    const inv = blank(filled('de-b2g'), 'buyerReference');
    const r = await run(inv, 'de-b2g');
    const ps = problemsFromRules(r.results, inv);
    const p = ps.find((x) => x.key === 'buyerReference')!;
    expect(p.ruleId).toBe('BR-DE-15');
    expect(describeProblem(p, 'en').text).toBe("Add your customer's Leitweg-ID.");
    expect(describeProblem(p, 'de').text).toBe('Tragen Sie die Leitweg-ID Ihres Kunden ein.');
  }, 30_000);

  it('a wrong Leitweg-ID check digit is caught before download', () => {
    const inv = { ...filled('de-b2g'), buyerReference: '04011000-1234512345-07' };
    expect(clientProblems(inv, AUDIENCES['de-b2g']).map((p) => p.messageId)).toEqual(['leitwegInvalid']);
  });

  it('category S with 0 % is reported on that line\'s VAT rate, not as a raw rule', async () => {
    const inv = filled('eu-b2b');
    inv.lines = [{ ...inv.lines[0]!, taxRate: 0 }, { ...inv.lines[0]!, name: 'Second', taxRate: 19 }];
    const r = await run(inv, 'eu-b2b');
    const keys = problemsFromRules(r.results, inv).map((p) => p.key);
    expect(keys.some((k) => /^lines\.0\.|^lines$|^totals$/.test(k))).toBe(true);
  }, 30_000);
});

describe('new lines default to the seller country\'s standard VAT rate (BR-S-05 rejects S with 0 %)', () => {
  it('DE 19, FR 20, BE 21, NL 21', () => {
    expect(emptyInvoice('DE').lines[0]!.taxRate).toBe(19);
    expect(emptyInvoice('FR').lines[0]!.taxRate).toBe(20);
    expect(emptyInvoice('BE').lines[0]!.taxRate).toBe(21);
    expect(emptyInvoice('NL').lines[0]!.taxRate).toBe(21);
  });
});

describe('amounts typed the way people write them, converted without floats', () => {
  it('German and English separators', () => {
    expect(normalizeDecimal('1.234,50', 'de')).toBe('1234.50');
    expect(normalizeDecimal('120,5', 'de')).toBe('120.5');
    expect(normalizeDecimal('1,234.50', 'en')).toBe('1234.50');
    expect(normalizeDecimal('120,50', 'en')).toBe('120.50');
    expect(normalizeDecimal('1,234', 'en')).toBe('1234');
    expect(normalizeDecimal('abc', 'en')).toBeUndefined();
    expect(parseAmount('0,10', 'de')).toBe(10);
    expect(formatAmount(123450, 'de')).toBe('1.234,50');
    expect(formatAmount(123450, 'en')).toBe('1,234.50');
  });
});
