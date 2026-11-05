/**
 * The OpenAPI 3.1 document, generated: request/response bodies come from the zod schemas in schemas.ts (the ones the app
 * validates with), the Invoice from @conformo/schema, and the paths from the endpoint table below. Nothing here is hand-written JSON.
 * `npm run openapi:generate` writes it to docs/openapi.json; test/server.test.ts fails when that file is stale.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { invoiceJsonSchema } from '@conformo/schema';
import { FORMAT_IDS } from '@conformo/toolkit';
import * as s from './schemas.js';
import { SERVER_VERSION } from './version.js';

type Json = Record<string, unknown>;

const NOT_SUPPORTED =
  'Conformo only produces, reads and checks documents. It does not transmit anything (no Peppol access point, no French PA/PDP, no KSeF, no SdI) and does not support FatturaPA or Facturae; it handles KSeF FA(3) only as domestic PLN invoices it writes and schema-checks (it cannot read them). '
  + 'A valid result means the rule sets listed in `ruleSets` passed, not that a tax authority accepts the invoice. The server stores nothing.';

/** A small, real invoice used in request examples (integer minor units: 10000 = EUR 100.00). */
export const EXAMPLE_INVOICE = {
  number: 'INV-2026-001', issueDate: '2026-09-01', dueDate: '2026-09-30', currency: 'EUR', buyerReference: '04011000-1234512345-06',
  paymentTerms: 'Payable within 30 days.',
  seller: {
    name: 'Example Software GmbH', vatId: 'DE123456789', street: 'Hauptstrasse 1', city: 'Berlin', postcode: '10115', country: 'DE',
    electronicAddress: 'billing@example-software.example', electronicAddressScheme: 'EM',
    contact: { name: 'Erika Mustermann', phone: '+49 30 1234567', email: 'billing@example-software.example' },
  },
  buyer: { name: 'Beispiel AG', street: 'Marktplatz 2', city: 'Hamburg', postcode: '20095', country: 'DE', electronicAddress: 'ap@beispiel.example', electronicAddressScheme: 'EM' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' },
  lines: [{ name: 'Consulting', quantity: 10, unitPriceMinor: 10000, unitCode: 'HUR', taxCategory: 'S', taxRate: 19 }],
};

const toSchema = (z: ZodTypeAny): Json => {
  const j = zodToJsonSchema(z, { target: 'jsonSchema7', $refStrategy: 'none' }) as Json;
  delete j.$schema;
  return j;
};
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

/** Request schema with `invoice` replaced by a $ref and, for exactly-one-of bodies, the oneOf constraint added. */
function requestSchema(z: ZodTypeAny, oneOf?: [string, string]): Json {
  const j = toSchema(z);
  const props = j.properties as Record<string, unknown>;
  if (props.invoice) props.invoice = ref('Invoice');
  if (oneOf) j.oneOf = oneOf.map((k) => ({ required: [k] }));
  return withFormatRefs(j);
}

const components: Record<string, Json> = {};
const register = (name: string, schema: Json): Json => { components[name] = schema; return ref(name); };

const issueRef = register('Issue', toSchema(s.issueSchema));
const errorJson = toSchema(s.errorSchema);
(errorJson.properties as Record<string, Json>).issues = { type: 'array', items: issueRef, description: 'Present for invalid_invoice and invalid_request.' };
const errorRef = register('Error', errorJson);
register('Invoice', { ...invoiceJsonSchema, $schema: undefined, title: 'Conformo Invoice (EN 16931)' } as Json);
delete components.Invoice!.$schema;
const formatRef = register('FormatId', { type: 'string', enum: [...FORMAT_IDS], description: 'Output XML syntax.' });

function withFormatRefs(j: Json): Json {
  // Replace the inlined format enum with a $ref so clients generate one type.
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === 'object') {
      const o = n as Json;
      if (Array.isArray(o.enum) && JSON.stringify(o.enum) === JSON.stringify(FORMAT_IDS)) return formatRef;
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
    }
    return n;
  };
  return walk(j) as Json;
}

const err = (description: string, example: Json): Json => ({ description, content: { 'application/json': { schema: errorRef, example } } });
const json = (description: string, schema: Json, example?: unknown): Json => ({ description, content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } } });
const body = (schema: Json, example: unknown, description?: string): Json => ({ required: true, ...(description ? { description } : {}), content: { 'application/json': { schema, example } } });

const E400 = err('The body is not valid JSON.', { error: 'malformed_json', message: 'The request body is not valid JSON.' });
const E413 = err('The body exceeds the size limit (default 8 MiB, CONFORMO_SERVER_MAX_BODY).', { error: 'payload_too_large', message: 'The request body exceeds the 8388608-byte limit.' });
const E422 = (example: Json): Json => err('The body is valid JSON but cannot be processed: a bad invoice (every bad field listed in `issues`), a missing or conflicting field, or a document that is not a supported invoice.', example);
const POST_ERRORS = { 400: E400, 413: E413 };

export function buildOpenApi(): Json {
  const tags = [{ name: 'create' }, { name: 'validate' }, { name: 'convert' }, { name: 'reference' }, { name: 'meta' }];
  const invalidInvoice = { error: 'invalid_invoice', message: 'The invoice cannot be written: 1 problem.', issues: [{ path: 'lines[0].taxRate', bt: 'BT-152', severity: 'error', message: 'VAT rate is required for category S' }] };
  const invalidRequest = { error: 'invalid_request', message: 'Provide exactly one of `xml` or `pdfBase64`.', issues: [{ path: '', bt: '', severity: 'error', message: 'Provide exactly one of `xml` or `pdfBase64`.' }] };
  const unprocessable = { error: 'unprocessable_document', message: 'The document is not a supported invoice syntax.' };

  const xmlOrPdfExamples = { xml: '<?xml version="1.0" encoding="UTF-8"?><Invoice>…use the xml returned by /v1/invoices/xml…</Invoice>' };

  const paths: Record<string, Json> = {
    '/v1/invoices/xml': { post: {
      operationId: 'createInvoiceXml', tags: ['create'], summary: 'Create e-invoice XML',
      description: `Serializes a structured invoice to CII, UBL, XRechnung or Peppol BIS XML. Money fields end in "Minor" and are integers in minor units; totals and the VAT breakdown are computed, never sent. ${NOT_SUPPORTED}`,
      requestBody: body(requestSchema(s.xmlRequest), { invoice: EXAMPLE_INVOICE, format: 'xrechnung-ubl' }),
      responses: { 200: json('The XML.', register('XmlResponse', withFormatRefs(toSchema(s.xmlResponse)))), ...POST_ERRORS, 422: E422(invalidInvoice) },
    } },
    '/v1/invoices/pdf': { post: {
      operationId: 'createInvoicePdf', tags: ['create'], summary: 'Create a Factur-X / ZUGFeRD PDF',
      description: `Creates a PDF/A-3b with the XML embedded. Returns the PDF bytes (application/pdf) by default; send \`Accept: application/json\` to get {pdfBase64, xml, xmlFilename, conformanceLevel} instead. Deterministic: the same invoice gives the same bytes. ${NOT_SUPPORTED}`,
      requestBody: body(requestSchema(s.pdfRequest), { invoice: EXAMPLE_INVOICE, profile: 'en16931', template: 'classic' }),
      responses: {
        200: { description: 'The PDF (default) or a JSON envelope (Accept: application/json).', content: {
          'application/pdf': { schema: { type: 'string', format: 'binary' } },
          'application/json': { schema: register('PdfJsonResponse', toSchema(s.pdfJsonResponse)) },
        } },
        ...POST_ERRORS, 422: E422(invalidInvoice),
      },
    } },
    '/v1/validate': { post: {
      operationId: 'validateInvoice', tags: ['validate'], summary: 'Validate an e-invoice',
      description: `Checks XML (or the XML embedded in a Factur-X/ZUGFeRD PDF) against XSD and the official Schematron rule sets. The HTTP status is 200 whether the document is valid or not: validity is \`valid\` in the body. A non-2xx status means the request or document could not be processed at all. ${NOT_SUPPORTED}`,
      requestBody: body(requestSchema(s.validateRequest, ['xml', 'pdfBase64']), { ...xmlOrPdfExamples, options: { country: 'DE' } }, 'Exactly one of `xml` or `pdfBase64`.'),
      responses: { 200: json('The full validation result.', register('ValidationResult', toSchema(s.validationResponse))), ...POST_ERRORS, 422: E422(invalidRequest) },
    } },
    '/v1/convert': { post: {
      operationId: 'convertInvoice', tags: ['convert'], summary: 'Convert an e-invoice between syntaxes',
      description: `Reads an existing e-invoice and writes it in another syntax. Fields the target cannot carry are not invented; validate the result. ${NOT_SUPPORTED}`,
      requestBody: body(requestSchema(s.convertRequest, ['source', 'sourcePdfBase64']), { source: xmlOrPdfExamples.xml, to: 'ubl' }, 'Exactly one of `source` or `sourcePdfBase64`.'),
      responses: { 200: json('The converted XML.', register('ConvertResponse', withFormatRefs(toSchema(s.convertResponse)))), ...POST_ERRORS, 422: E422(unprocessable) },
    } },
    '/v1/parse': { post: {
      operationId: 'parseInvoice', tags: ['convert'], summary: 'Parse an e-invoice into JSON',
      description: 'Reads CII, UBL, XRechnung or Peppol XML, or a Factur-X/ZUGFeRD PDF, into the Invoice model (the shape /v1/invoices/xml accepts). It does not validate. `totalsCheck` says whether the totals stated in the document survive recomputation from its lines.',
      requestBody: body(requestSchema(s.parseRequest, ['xml', 'pdfBase64']), xmlOrPdfExamples, 'Exactly one of `xml` or `pdfBase64`.'),
      responses: { 200: json('The parsed invoice.', register('ParseResponse', toSchema(s.parseResponse))), ...POST_ERRORS, 422: E422(unprocessable) },
    } },
    '/v1/requirements': { get: {
      operationId: 'listRequirements', tags: ['reference'], summary: 'List countries with e-invoicing data',
      responses: { 200: json('Supported countries.', register('RequirementsList', toSchema(s.requirementsListResponse)), { countries: [{ country: 'DE', name: 'Germany' }] }) },
    } },
    '/v1/requirements/{country}': { get: {
      operationId: 'getRequirements', tags: ['reference'], summary: 'E-invoicing requirements for a country',
      description: 'What the sourced dataset says (mandates, dates, thresholds, required formats, official sources) plus `conformoSupport`: per required format, whether this toolkit can generate, read and validate it. Items with status "unverified" are not confirmed from an official source. Information, not legal advice.',
      parameters: [{ name: 'country', in: 'path', required: true, description: 'ISO 3166-1 alpha-2 code, case-insensitive.', schema: { type: 'string', minLength: 2, maxLength: 2 }, example: 'DE' }],
      responses: { 200: json('The country record.', register('Requirements', toSchema(s.requirementsResponse))), 404: err('No data for that country.', { error: 'not_found', message: 'No data for country "XX".' }) },
    } },
    '/v1/rules/{id}': { get: {
      operationId: 'explainRule', tags: ['reference'], summary: 'Explain a validation rule',
      description: 'The publisher\'s wording from the compiled rule sets plus a plain-language summary, why it exists and how to fix it, where one exists.',
      parameters: [{ name: 'id', in: 'path', required: true, description: 'Rule id as returned by /v1/validate.', schema: { type: 'string', minLength: 1 }, example: 'BR-CO-15' }],
      responses: { 200: json('The explanation.', register('RuleExplanation', toSchema(s.ruleResponse))), 404: err('The id is unknown to the compiled rule sets.', { error: 'not_found', message: 'No rule "X" is known to the compiled rule sets.' }) },
    } },
    '/healthz': { get: {
      operationId: 'health', tags: ['meta'], summary: 'Liveness',
      responses: { 200: json('The server is up.', register('Health', toSchema(s.healthResponse)), { status: 'ok', version: SERVER_VERSION }) },
    } },
    '/openapi.json': { get: {
      operationId: 'openapi', tags: ['meta'], summary: 'This document',
      responses: { 200: { description: 'The OpenAPI 3.1 document.', content: { 'application/json': { schema: { type: 'object' } } } } },
    } },
    '/docs': { get: {
      operationId: 'docs', tags: ['meta'], summary: 'Human-readable entry page',
      responses: { 200: { description: 'A static HTML page linking to openapi.json.', content: { 'text/html': { schema: { type: 'string' } } } } },
    } },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Conformo HTTP API', version: SERVER_VERSION,
      description: `Stateless HTTP API over @conformo/toolkit: create, validate, convert and parse EN 16931 e-invoices. No accounts, no sessions, nothing written to disk. There is no authentication: put it behind a TLS reverse proxy with auth before exposing it. ${NOT_SUPPORTED}`,
      license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    },
    servers: [{ url: '/' }],
    tags,
    paths,
    components: { schemas: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))) },
  };
}

export const openApiText = (): string => `${JSON.stringify(buildOpenApi(), null, 2)}\n`;
