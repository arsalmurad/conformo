import type { CountryCompliance, FormatId, Mandate, MandateStatus, Scope } from './types.js';

const SCOPES: Scope[] = ['B2G', 'B2B', 'B2C'];
const STATUSES: MandateStatus[] = ['mandatory', 'planned', 'voluntary', 'delayed', 'unverified'];
const FORMATS: FormatId[] = [
  'cii', 'factur-x', 'zugferd', 'xrechnung', 'ubl-2.1', 'peppol-bis-3.0', 'fatturapa', 'ksef-fa', 'facturae', 'other',
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_COUNTRY = /^[A-Z]{2}$/;

export class ComplianceDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceDataError';
  }
}

function fail(context: string, message: string): never {
  throw new ComplianceDataError(`${context}: ${message}`);
}

function assertMandate(m: Mandate, context: string): void {
  if (!SCOPES.includes(m.scope)) fail(context, `unknown scope ${JSON.stringify(m.scope)}`);
  if (!STATUSES.includes(m.status)) fail(context, `unknown status ${JSON.stringify(m.status)}`);
  if (m.effectiveDate !== undefined && !ISO_DATE.test(m.effectiveDate)) {
    fail(context, `effectiveDate ${JSON.stringify(m.effectiveDate)} is not an ISO yyyy-mm-dd date`);
  }
  if (!Array.isArray(m.requiredFormats) || m.requiredFormats.length === 0) {
    fail(context, 'requiredFormats must be a non-empty array');
  }
  for (const f of m.requiredFormats) {
    if (!FORMATS.includes(f)) fail(context, `unknown format ${JSON.stringify(f)}`);
  }
  if (m.status === 'unverified' && m.sourceUrl === undefined) {
    // Allowed: an unverified mandate may simply have no source yet. Not an error.
  }
}

/**
 * Enforces the one rule that makes this dataset trustworthy rather than just
 * shaped correctly: a row claiming 'verified' must actually have a real
 * source URL, and every mandate's own dates must parse. This is deliberately
 * strict — a malformed or missing source fails the build (see
 * tools/build-compliance-data.ts), not a silent warning.
 */
export function assertCountryCompliance(c: CountryCompliance, context: string): void {
  if (!ISO_COUNTRY.test(c.country)) fail(context, `country ${JSON.stringify(c.country)} is not an ISO 3166-1 alpha-2 code`);
  if (!c.name) fail(context, 'name is required');
  if (!ISO_DATE.test(c.lastVerified)) fail(context, `lastVerified ${JSON.stringify(c.lastVerified)} is not an ISO yyyy-mm-dd date`);
  if (c.status === 'verified') {
    if (!c.sourceUrl || !/^https:\/\//.test(c.sourceUrl)) {
      fail(context, `status is 'verified' but sourceUrl ${JSON.stringify(c.sourceUrl)} is not a real https URL`);
    }
  }
  if (!Array.isArray(c.mandates) || c.mandates.length === 0) fail(context, 'mandates must be a non-empty array');
  c.mandates.forEach((m, i) => assertMandate(m, `${context} mandates[${i}]`));
}
