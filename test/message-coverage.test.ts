import { describe, it, expect } from 'vitest';
import { computeCoverage } from '../packages/validate/src/coverage.js';

describe('computeCoverage(): tracked as a fact, not discovered by a reviewer', () => {
  it('reads the real compiled artefact and finds a majority of rules hand-written', () => {
    const report = computeCoverage();
    expect(report.totalRules).toBeGreaterThan(150); // the real EN 16931 rule set is ~200
    expect(report.writtenRules).toBeGreaterThanOrEqual(100);
    expect(report.percent).toBeGreaterThan(50);
    expect(report.writtenRules + report.missingRuleIds.length).toBe(report.totalRules);
  });

  it("every VAT-category family this project's own fixtures exercise is fully covered", () => {
    const { missingRuleIds } = computeCoverage();
    const missing = new Set(missingRuleIds);
    for (const prefix of ['BR-S-', 'BR-Z-', 'BR-E-', 'BR-AE-', 'BR-IC-', 'BR-G-', 'BR-O-']) {
      const gap = [...missing].filter((id) => id.startsWith(prefix));
      expect(gap, `expected no gaps in the ${prefix}* family, found ${gap.join(', ')}`).toEqual([]);
    }
  });
});
