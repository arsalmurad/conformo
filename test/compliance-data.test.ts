import { describe, it, expect } from 'vitest';
import { countries, dataset, getCountry } from '../packages/compliance-data/src/index.js';

describe('compliance-data: loads and validates every data/*.json file', () => {
  it('loads at least the seven researched EU countries', () => {
    const codes = countries.map((c) => c.country).sort();
    expect(codes).toEqual(expect.arrayContaining(['BE', 'DE', 'ES', 'FR', 'IT', 'NL', 'PL']));
  });

  it("Poland's B2B mandate uses its native KSeF FA(3) schema, not Peppol", () => {
    const pl = getCountry('PL')!;
    const b2b = pl.mandates.find((m) => m.scope === 'B2B')!;
    expect(b2b.requiredFormats).toEqual(['ksef-fa']);
    expect(b2b.status).toBe('mandatory');
  });

  it("Spain's B2B mandate has no guessed effective date, since its source reports none set yet", () => {
    const es = getCountry('ES')!;
    const b2b = es.mandates.find((m) => m.scope === 'B2B')!;
    expect(b2b.status).toBe('planned');
    expect(b2b.effectiveDate).toBeUndefined();
  });

  it('every row has at least one mandate and a real https source when verified', () => {
    for (const c of countries) {
      expect(c.mandates.length).toBeGreaterThan(0);
      if (c.status === 'verified') {
        expect(c.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it('getCountry() finds a row case-insensitively', () => {
    expect(getCountry('fr')?.name).toBe('France');
    expect(getCountry('FR')?.name).toBe('France');
    expect(getCountry('zz')).toBeUndefined();
  });

  it('dataset.generatedAt is derived from the data, not the clock', () => {
    // Every row's lastVerified is currently 2025-08-14, so the derived date
    // must be exactly that — proves this isn't `new Date()` at import time.
    expect(dataset.generatedAt).toBe('2025-08-14');
  });

  it('France models the BR-FR mandatory note-subject-code requirement this repo already implements', () => {
    const fr = getCountry('FR')!;
    expect(fr.extraFieldsBeyondEN16931?.join(' ')).toMatch(/AAB/);
  });

  it('Belgium is recorded as already mandatory for B2B (effective 2026-01-01, before today)', () => {
    const be = getCountry('BE')!;
    const b2b = be.mandates.find((m) => m.scope === 'B2B')!;
    expect(b2b.status).toBe('mandatory');
    expect(b2b.requiredFormats).toContain('peppol-bis-3.0');
  });

  it('Netherlands is honest about having no B2B mandate rather than omitting the row', () => {
    const nl = getCountry('NL')!;
    const b2b = nl.mandates.find((m) => m.scope === 'B2B')!;
    expect(b2b.status).toBe('voluntary');
  });
});
