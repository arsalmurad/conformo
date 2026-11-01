/**
 * Loads the SaxonJS runtime and the compiled rule sets from public/validator/ (filled by
 * scripts/copy-validator-assets.mjs) through @conformo/validate's page loader. Which rule sets run is
 * decided by the document itself (root element and BT-24), exactly as in Node.
 */
import { createPageValidator } from '@conformo/validate/page';
import type { ValidateOptions, ValidationResult } from '@conformo/validate/page';
import { BASE_URL } from './baseUrl.js';

const validatePage = createPageValidator(BASE_URL);

export function validateInvoiceXml(xml: string, options: ValidateOptions = {}): Promise<ValidationResult> {
  return validatePage(xml, options);
}
