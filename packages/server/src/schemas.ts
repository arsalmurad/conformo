/**
 * Request and response shapes of the HTTP API, as zod. They do two jobs: the app validates request bodies with them,
 * and openapi.ts turns the very same objects into the OpenAPI document, so the spec cannot describe something the
 * server does not enforce.
 */
import { z } from 'zod';
import { FORMAT_IDS, PDF_PROFILES } from '@conformo/toolkit';
import { invoiceSchema } from '@conformo/schema';

export const TEMPLATES = ['classic', 'modern', 'compact'] as const;

export const formatEnum = z.enum(FORMAT_IDS).describe('Output XML syntax.');

export const issueSchema = z.object({
  path: z.string().describe('Path of the offending field in the request body, e.g. lines[0].taxRate.'),
  bt: z.string().describe('EN 16931 business term (BT-/BG-) the field maps to; empty when none applies.'),
  severity: z.string().describe('"error" or "warning".'),
  message: z.string(),
}).describe('One problem with the input.');

export const errorSchema = z.object({
  error: z.enum(['invalid_invoice', 'invalid_request', 'malformed_json', 'payload_too_large', 'unprocessable_document', 'not_found', 'method_not_allowed', 'internal_error']),
  message: z.string(),
  issues: z.array(issueSchema).optional().describe('Present for invalid_invoice and invalid_request.'),
}).describe('Every non-2xx response has this shape. Stack traces are never included.');

const base64Pdf = z.string().describe('A Factur-X / ZUGFeRD PDF/A-3 as base64 (standard alphabet); the embedded XML is used.');
const xmlText = z.string().describe('The invoice as XML text (CII, UBL Invoice/CreditNote, XRechnung, Peppol BIS).');

export const xmlRequest = z.object({ invoice: invoiceSchema, format: formatEnum }).strict();
export const pdfRequest = z.object({
  invoice: invoiceSchema,
  profile: z.enum(PDF_PROFILES).optional().describe('Factur-X / ZUGFeRD profile. Default en16931.'),
  template: z.enum(TEMPLATES).optional().describe('Page layout. Default classic.'),
}).strict();
export const validateRequest = z.object({
  xml: xmlText.optional(),
  pdfBase64: base64Pdf.optional(),
  options: z.object({
    country: z.enum(['FR', 'DE']).optional().describe('Add a country layer on top of EN 16931.'),
    profile: z.enum(['en16931', 'xrechnung', 'peppol']).optional().describe('Force the rule set instead of reading it from BT-24.'),
    xsd: z.boolean().optional().describe('Run XSD validation too. Default true.'),
  }).strict().optional(),
}).strict();
export const convertRequest = z.object({
  source: xmlText.optional().describe('The source invoice as XML text. Provide this OR sourcePdfBase64.'),
  sourcePdfBase64: base64Pdf.optional().describe('The source as a Factur-X / ZUGFeRD PDF, base64. Provide this OR source.'),
  to: formatEnum,
}).strict();
export const parseRequest = z.object({ xml: xmlText.optional(), pdfBase64: base64Pdf.optional() }).strict();

export const xmlResponse = z.object({ xml: z.string(), format: formatEnum, warnings: z.array(z.string()).describe('Non-fatal findings, e.g. a missing XRechnung precondition.') });
export const pdfJsonResponse = z.object({
  pdfBase64: z.string(), xml: z.string().describe('The XML embedded in the PDF.'), xmlFilename: z.string().describe('Name of the embedded attachment.'),
  conformanceLevel: z.string().describe('fx:ConformanceLevel written to the XMP packet.'),
});

const ruleResult = z.object({
  ruleId: z.string(), severity: z.enum(['error', 'fatal', 'warning', 'info']), fields: z.array(z.string()), xpath: z.string(), message: z.string(),
  originalSeverity: z.enum(['error', 'fatal', 'warning', 'info']).optional(), ruleSet: z.string(),
  plainLanguage: z.object({ summary: z.string(), why: z.string(), fix: z.string() }).optional(),
});
export const validationResponse = z.object({
  valid: z.boolean().describe('True only when no error-level rule failed and XSD (if it ran) passed. The HTTP status is 200 either way.'),
  origin: z.enum(['xml', 'pdf']), embeddedFilename: z.string().optional(),
  firedCount: z.number().describe('Schematron rules that fired across every rule set that ran.'),
  results: z.array(ruleResult).describe('Every rule finding, errors and advisories.'),
  detected: z.object({
    syntax: z.enum(['cii', 'ubl-invoice', 'ubl-creditnote']), profile: z.string(), customizationId: z.string().optional(),
    businessProcess: z.string().optional(), variant: z.enum(['standard', 'extension', 'cvd']).optional(),
  }),
  ruleSets: z.array(z.object({ id: z.string(), label: z.string(), source: z.string(), fired: z.number(), failed: z.number(), advisory: z.number() })).describe('Exactly the rule sets that ran. Never claim more than this list.'),
  xsd: z.object({ ran: z.boolean(), schema: z.string().optional(), valid: z.boolean().optional(), errors: z.array(z.string()), skippedReason: z.string().optional() }),
  notices: z.array(z.object({ severity: z.enum(['error', 'warning', 'info']), code: z.string(), message: z.string() })),
});
const totalsCheck = z.object({ matches: z.boolean(), differences: z.array(z.string()) }).describe('Whether the totals stated in the document equal the totals recomputed from its lines.');
export const convertResponse = z.object({ xml: z.string(), from: z.enum(['cii', 'ubl-invoice', 'ubl-credit-note']), to: formatEnum, warnings: z.array(z.string()), totalsCheck });
export const parseResponse = z.object({
  invoice: z.object({}).passthrough().describe('The Invoice, in the shape of the Invoice schema. Money in integer minor units.'),
  format: z.enum(['cii', 'ubl-invoice', 'ubl-credit-note']), origin: z.enum(['xml', 'pdf']), embeddedFilename: z.string().optional(),
  totalsCheck, visibleTotals: z.object({}).passthrough().optional().describe('PDF only: printed totals compared with the embedded XML.'),
});
export const requirementsListResponse = z.object({ countries: z.array(z.object({ country: z.string(), name: z.string() })) });
export const requirementsResponse = z.object({
  country: z.string(), name: z.string(),
  conformoSupport: z.record(z.object({ generate: z.boolean(), read: z.boolean(), validate: z.boolean(), note: z.string() })).describe('Per required format: can this toolkit generate, read, validate it? FatturaPA, KSeF and Facturae: no.'),
}).passthrough().describe('The sourced country record (mandates, dates, thresholds, sources) plus conformoSupport. This is information, not legal advice.');
export const ruleResponse = z.object({
  ruleId: z.string(), found: z.boolean(), official: z.array(z.object({ ruleSet: z.string(), text: z.string() })),
  plainLanguage: z.object({ summary: z.string(), why: z.string(), fix: z.string() }).optional(),
});
export const healthResponse = z.object({ status: z.literal('ok'), version: z.string() });
