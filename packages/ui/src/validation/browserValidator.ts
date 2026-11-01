import { createPageValidator } from '@conformo/validate/page';
import type { ValidateOptions, ValidationResult } from '@conformo/validate/page';
import { BASE_URL } from '../baseUrl.js';

/**
 * Browser-side validation for the live editor, served from public/validator/ (gitignored; filled by
 * scripts/copy-validator-assets.mjs). The app only ever generates CII, so it needs the CII rule sets:
 * EN 16931 always, XRechnung for the Germany profile, French CTC for France. The first is prefetched so
 * the first edit does not wait for the network (an edit-to-preview budget of 500ms depends on it).
 */
const validatePage = createPageValidator(BASE_URL, ['en16931-cii']);

export function validateInvoiceXml(xml: string, options: ValidateOptions = {}): Promise<ValidationResult> {
  return validatePage(xml, options);
}
