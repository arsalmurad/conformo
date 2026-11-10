import { describe, it, expect } from 'vitest';
import { computeCoverage } from '../packages/validate/src/coverage.js';

describe('computeCoverage(): the syntax rules (CII-DT, CII-SR, UBL-CR, UBL-DT, UBL-SR)', () => {
  it('reads them from the compiled rule sets and nearly all get a plain-language message by hand or by family', () => {
    const { syntax } = computeCoverage();
    expect(syntax.totalRules).toBeGreaterThan(1000);
    expect(syntax.percent).toBeGreaterThan(95);
    expect(syntax.withMessage + syntax.missingRuleIds.length).toBe(syntax.totalRules);
  });

  it('the rules a generator is most likely to hit are covered: attribute and element rules, cardinality, UBL-CR', () => {
    const missing = new Set(computeCoverage().syntax.missingRuleIds);
    for (const id of ['CII-DT-031', 'CII-DT-001', 'CII-DT-009', 'CII-DT-068', 'CII-SR-001', 'UBL-CR-001', 'UBL-DT-01', 'UBL-DT-08', 'UBL-SR-33']) {
      expect(missing.has(id), id).toBe(false);
    }
  });
});
