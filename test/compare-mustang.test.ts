// tools/compare-mustang.mjs: parsing Mustang-CLI's validation report and comparing it with Conformo's result, on
// reports recorded from Mustang-CLI 2.26.0 (test/mustang-fixtures). Neither Java nor Mustang is run here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs tool without type declarations
import * as cmp from '../tools/compare-mustang.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (f: string) => readFileSync(path.join(here, 'mustang-fixtures', f), 'utf-8');

describe('Mustang report parsing', () => {
  it('a notice is advisory, not a failure (the log lines before the XML are ignored)', () => {
    expect(cmp.parseMustangReport(fx('valid-with-notice.txt'))).toEqual({ status: 'valid', failed: [], advisory: ['BR-DE-TMP-32'] });
  });
  it('an internal exception counts as a failure, with its own id', () => {
    const r = cmp.parseMustangReport(fx('exception.txt'));
    expect(r.status).toBe('invalid');
    expect(r.failed).toEqual(['mustang-exception-22']);
    expect(r.advisory).toEqual(['PEPPOL-EN16931-R001']);
  });
  it('a message without a rule id is labelled by its Mustang type', () => {
    expect(cmp.parseMustangReport(fx('unsupported-profile.txt')).failed).toEqual(['mustang-type-25']);
    expect(cmp.mustangRuleId('4', '[BR-CO-10]-Sum of Invoice line net amount')).toBe('BR-CO-10');
  });
});

describe('comparison', () => {
  const conformo = (valid: boolean, failed: string[] = []) => ({ valid, failed });
  it('Conformo failures include an XSD failure', () => {
    expect(cmp.conformoFailed({ results: [{ ruleId: 'BR-01', severity: 'error' }, { ruleId: 'BR-02', severity: 'warning' }], xsd: { ran: true, valid: false } })).toEqual(['BR-01', 'XSD']);
  });
  it('classifies the reasons the two verdicts differ', () => {
    const row = (c: { valid: boolean; failed: string[] }, m: { valid: boolean; failed: string[] }) => cmp.compareRow('f.xml', c, m);
    expect(cmp.classify(row(conformo(true), conformo(false, ['mustang-exception-22'])))).toMatch(/internal Java exception/);
    expect(cmp.classify(row(conformo(true), conformo(false, ['mustang-type-25'])))).toMatch(/ZUGFeRD 1.0/);
    expect(cmp.classify(row(conformo(false, ['PEPPOL-COMMON-R049', 'SE-R-013']), conformo(true)))).toMatch(/Peppol BIS/);
    expect(cmp.classify(row(conformo(true), conformo(false, ['FX-SCH-A-000589'])))).toMatch(/Factur-X Schematron/);
    expect(cmp.classify(row(conformo(true), conformo(false, ['BR-CO-16'])))).toMatch(/do not raise as errors/);
  });
  it('the summary says which side the KoSIT validator agrees with', () => {
    const rows = [
      { ...cmp.compareRow('a', conformo(true), conformo(false, ['BR-CL-13'])), corpus: 'k', rel: 'k/a', kosit: 'accept' },
      { ...cmp.compareRow('b', conformo(true), conformo(true)), corpus: 'k', rel: 'k/b' },
      { ...cmp.compareRow('c', conformo(false, ['PEPPOL-COMMON-R049']), conformo(true)), corpus: 'k', rel: 'k/c', kosit: 'no-scenario' },
    ];
    const s = cmp.summarize(rows, [{ id: 'k', title: 'K' }], { mustangVersion: '2.26.0' });
    expect(s.corpora).toEqual([{ id: 'k', title: 'K', files: 3, sameVerdict: 1, bothValid: 1, bothInvalid: 0, sameFailedRules: 1 }]);
    expect(s.disagreements.map((d: { file: string; kositSidesWith: string }) => [d.file, d.kositSidesWith])).toEqual([['k/a', 'conformo'], ['k/c', 'unknown']]);
  });
});
