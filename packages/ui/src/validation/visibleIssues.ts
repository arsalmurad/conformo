import type { RuleResult } from '@verinvoice/validate/browser';
import type { LiveValidation } from './useLiveValidation.js';
import type { TouchedFields } from './useTouchedFields.js';
import { touchKeyFor } from './touchKey.js';

export interface Issue {
  /** The byField/bySection key this issue is attributed to — also the
   * data-field value InvoiceEditor's inputs carry, so a summary entry can
   * navigate straight to the offending field. */
  key: string;
  rule: RuleResult;
}

/** The same visibility rule InvoiceEditor's fieldErrors()/sectionErrors()
 * apply per field, applied here to build one flat, navigable list — so the
 * headline "N issues to fix" count and what's actually shown inline can
 * never disagree (Part C: a fresh, untouched form should not say "7 issues
 * to fix" before the user has typed anything). */
export function visibleIssues(validation: LiveValidation, touchedFields: TouchedFields): Issue[] {
  const issues: Issue[] = [];
  for (const [key, rules] of Object.entries(validation.byField)) {
    if (!touchedFields.isVisible(touchKeyFor(key))) continue;
    for (const rule of rules) issues.push({ key, rule });
  }
  for (const [key, rules] of Object.entries(validation.bySection)) {
    if (!touchedFields.isVisible(touchKeyFor(key))) continue;
    for (const rule of rules) issues.push({ key, rule });
  }
  return issues;
}
