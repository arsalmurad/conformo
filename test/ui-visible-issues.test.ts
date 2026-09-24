import { describe, it, expect } from 'vitest';
import { visibleIssues } from '../packages/ui/src/validation/visibleIssues.js';
import { touchKeyFor } from '../packages/ui/src/validation/touchKey.js';
import type { LiveValidation } from '../packages/ui/src/validation/useLiveValidation.js';
import type { TouchedFields } from '../packages/ui/src/validation/useTouchedFields.js';
import type { RuleResult } from '@invoice-engine/validate/browser';

function rule(ruleId: string): RuleResult {
  return { ruleId, severity: 'error', fields: [], xpath: '', message: `${ruleId} failed` };
}

function touchedFieldsOf(visible: string[]): TouchedFields {
  const set = new Set(visible);
  return { isVisible: (key) => set.has(key), markTouched: () => {}, revealAll: () => {} };
}

// Regression for the project's own conventions Part C: "Do not
// flag fields the user has not touched yet" — a nearly-empty form used to
// show every mandatory-field error at once regardless of what the user had
// actually interacted with.
describe('visibleIssues(): only shows issues for fields the user has touched (or after revealAll)', () => {
  const validation: LiveValidation = {
    checking: false,
    ready: true,
    byField: { 'seller.name': [rule('BR-06')], 'buyer.name': [rule('BR-07')] },
    bySection: { lines: [rule('BR-16')], tax: [rule('BR-CO-18')] },
    errorCount: 3,
  };

  it('hides everything on a completely untouched form', () => {
    expect(visibleIssues(validation, touchedFieldsOf([]))).toEqual([]);
  });

  it('reveals only the field that was actually touched', () => {
    const issues = visibleIssues(validation, touchedFieldsOf(['seller.name']));
    expect(issues.map((i) => i.rule.ruleId)).toEqual(['BR-06']);
  });

  it("'tax' piggybacks on 'lines' being touched, since it has no input of its own to blur", () => {
    const linesOnly = visibleIssues(validation, touchedFieldsOf(['lines']));
    expect(linesOnly.map((i) => i.rule.ruleId).sort()).toEqual(['BR-16', 'BR-CO-18']);

    const taxOnly = visibleIssues(validation, touchedFieldsOf(['tax']));
    expect(taxOnly).toEqual([]); // 'tax' alone doesn't count as 'lines' touched
  });

  it('shows everything once every relevant key is visible (the revealAll case)', () => {
    const all = touchedFieldsOf(['seller.name', 'buyer.name', 'lines', 'tax']);
    expect(visibleIssues(validation, all)).toHaveLength(4);
  });
});

describe('touchKeyFor()', () => {
  it('maps the two computed sections to the lines input, and leaves everything else alone', () => {
    expect(touchKeyFor('tax')).toBe('lines');
    expect(touchKeyFor('totals')).toBe('lines');
    expect(touchKeyFor('lines')).toBe('lines');
    expect(touchKeyFor('seller.name')).toBe('seller.name');
    expect(touchKeyFor('payment')).toBe('payment');
  });
});
