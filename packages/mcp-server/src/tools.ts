/**
 * The MCP tools. Each one is a thin wrapper over a @conformo/toolkit call: no invoice, validation or format logic lives
 * here, only input/output shaping, descriptions for the agent, and error mapping.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  checkInvoice, convert, createPdf, createXml, explainRule, getRequirements, parse, validate,
  FORMAT_DESCRIPTIONS, FORMAT_IDS, InvoiceInputError, PDF_LANGUAGES, PDF_PROFILES, SUPPORTED_COUNTRIES, ValidationInputError,
} from '@conformo/toolkit';
import type { Invoice } from '@conformo/toolkit';
import { invoiceSchema } from '@conformo/schema';
import { PathPolicyError, resolveOutputPath } from './paths.js';

type Issue = { path: string; bt: string; severity: string; message: string };
type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

const text = (t: string) => ({ type: 'text' as const, text: t });
const fmtIssue = (i: Issue): string => `${i.path || '(invoice)'}${i.bt ? ` [${i.bt}]` : ''}: ${i.message}`;

function fail(message: string, issues: Issue[] = []): ToolResult {
  return {
    isError: true,
    content: [text(issues.length ? `${message}\n${issues.map((i) => `  - ${fmtIssue(i)}`).join('\n')}` : message)],
    // Not structuredContent: clients validate it against the tool's outputSchema, which an error does not satisfy.
    _meta: { error: message, issues },
  };
}

/** Maps every known failure to an isError result. Never leaks a stack trace. */
async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InvoiceInputError) {
      return fail(`The invoice cannot be written: ${err.issues.length} problem${err.issues.length === 1 ? '' : 's'}. Fix every listed field and call again.`, err.issues);
    }
    if (err instanceof ValidationInputError || err instanceof PathPolicyError) return fail(err.message);
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const warningsOf = (invoice: unknown): string[] =>
  checkInvoice(invoice).filter((i) => i.severity === 'warning').map(fmtIssue);

const FORMAT_LIST = FORMAT_IDS.map((f) => `"${f}" = ${FORMAT_DESCRIPTIONS[f]}`).join('; ');

const NOT_SUPPORTED =
  'Conformo only produces, reads and checks documents. It does NOT transmit anything (no Peppol access point, no French PA/PDP, no KSeF, no SdI), '
  + 'and it does not support FatturaPA, KSeF FA(3) or Facturae. A valid result means the rule sets listed in `ruleSets` passed, not that a tax authority accepts the invoice.';

const issueShape = z.object({ path: z.string(), bt: z.string(), severity: z.string(), message: z.string() });
const formatEnum = z.enum(FORMAT_IDS).describe(`Output syntax. ${FORMAT_LIST}.`);

const xmlOrPdfInput = {
  xml: z.string().optional().describe('The invoice as XML text (CII, UBL Invoice/CreditNote, XRechnung, Peppol BIS). Provide this OR pdfBase64.'),
  pdfBase64: z.string().optional().describe('A Factur-X / ZUGFeRD PDF/A-3 as base64; the embedded XML is used. Provide this OR xml.'),
};

function sourceOf(a: { xml?: string | undefined; pdfBase64?: string | undefined }): string | Uint8Array {
  if ((a.xml === undefined) === (a.pdfBase64 === undefined)) throw new Error('Provide exactly one of `xml` (XML text) or `pdfBase64` (a base64 PDF).');
  if (a.xml !== undefined) return a.xml;
  const b64 = a.pdfBase64!.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error('pdfBase64 is not valid base64.');
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') throw new Error('pdfBase64 does not decode to a PDF (missing %PDF header).');
  return bytes;
}

const ruleResultShape = z.object({
  ruleId: z.string(), severity: z.enum(['error', 'fatal', 'warning', 'info']), message: z.string(),
  fields: z.array(z.string()), xpath: z.string(), ruleSet: z.string(),
  plainLanguage: z.object({ summary: z.string(), why: z.string(), fix: z.string() }).optional(),
});

export function registerTools(server: McpServer): void {
  server.registerTool('create_invoice', {
    title: 'Create an e-invoice (XML)',
    description:
      'Turns a structured invoice into e-invoice XML: plain EN 16931 CII or UBL, XRechnung (CII or UBL), or Peppol BIS Billing 3.0. '
      + 'Use it when the user wants an invoice document that a machine can read. Pass the invoice as a JSON OBJECT (not a string); each field of the input schema says which EN 16931 BT/BG it is. '
      + 'ALL money fields end in "Minor" and are INTEGERS in minor units (EUR 12.34 = 1234); never send decimals. Do not send totals or the VAT breakdown: they are computed. '
      + 'Document-level problems are returned as an error listing every bad field (path, BT id, message); fix them all and call again. '
      + 'Call validate_invoice on the result to check it against the official rule sets. For a PDF use create_invoice_pdf. '
      + NOT_SUPPORTED,
    inputSchema: { invoice: invoiceSchema.describe('The invoice. Required: number, issueDate, currency, seller, buyer, lines.'), format: formatEnum },
    outputSchema: { xml: z.string(), format: z.enum(FORMAT_IDS), warnings: z.array(z.string()).describe('Non-fatal findings, e.g. a missing XRechnung precondition.') },
    annotations: { title: 'Create an e-invoice (XML)', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    const r = createXml(a.invoice as Invoice, a.format);
    return {
      content: [text(r.xml), ...(r.warnings.length ? [text(`Warnings:\n${r.warnings.map((w) => `- ${w}`).join('\n')}`)] : [])],
      structuredContent: { xml: r.xml, format: r.format, warnings: r.warnings },
    };
  }));

  server.registerTool('create_invoice_pdf', {
    title: 'Create a Factur-X / ZUGFeRD PDF',
    description:
      'Creates a human-readable PDF/A-3b invoice with the machine-readable XML embedded (Factur-X / ZUGFeRD hybrid). Same invoice input as create_invoice. '
      + '`profile`: "en16931" (default; Factur-X/ZUGFeRD EN 16931), "xrechnung" (ZUGFeRD XRECHNUNG, for German public sector) or "extended". `template` picks the page layout and `language` the language of the printed labels ("en" default, "de" German, "fr" French; the embedded XML is the same in every language). '
      + 'Without `outputPath` the PDF comes back base64-encoded in structuredContent.pdfBase64 (it can be large). With `outputPath` the file is written instead (nothing is returned inline): '
      + 'the path must end in .pdf and stay inside the server\'s working directory, and an existing file is refused unless `overwrite` is true. '
      + 'The output is deterministic: the same invoice gives the same bytes. Check it with validate_invoice (pass pdfBase64). ' + NOT_SUPPORTED,
    inputSchema: {
      invoice: invoiceSchema.describe('The invoice. Required: number, issueDate, currency, seller, buyer, lines.'),
      profile: z.enum(PDF_PROFILES).optional().describe('Factur-X / ZUGFeRD profile. Default en16931.'),
      template: z.enum(['classic', 'modern', 'compact']).optional().describe('Page layout. Default classic.'),
      language: z.enum(PDF_LANGUAGES).optional().describe('Language of the printed labels: en, de or fr. Default en. Presentation only; the XML does not change.'),
      outputPath: z.string().optional().describe('Write the PDF here instead of returning base64. Relative to the server working directory; must end in .pdf.'),
      overwrite: z.boolean().optional().describe('Allow replacing an existing file at outputPath. Default false.'),
    },
    outputSchema: {
      profile: z.enum(PDF_PROFILES), xmlFilename: z.string().describe('Name of the embedded XML attachment.'), conformanceLevel: z.string(),
      byteLength: z.number(), sha256: z.string(), warnings: z.array(z.string()),
      pdfBase64: z.string().optional().describe('The PDF, base64. Absent when outputPath was given.'),
      outputPath: z.string().optional().describe('Absolute path written, when outputPath was given.'),
    },
    annotations: { title: 'Create a Factur-X / ZUGFeRD PDF', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    // Resolve the path first so a refused path costs nothing and nothing is rendered.
    const target = a.outputPath !== undefined ? resolveOutputPath(a.outputPath) : undefined;
    const warnings = warningsOf(a.invoice);
    const r = await createPdf(a.invoice as Invoice, { ...(a.profile ? { profile: a.profile } : {}), ...(a.template ? { template: a.template } : {}), ...(a.language ? { language: a.language } : {}) });
    const meta = {
      profile: r.profile, xmlFilename: r.xmlFilename, conformanceLevel: r.conformanceLevel,
      byteLength: r.pdf.length, sha256: createHash('sha256').update(r.pdf).digest('hex'), warnings,
    };
    if (target) {
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await writeFile(target, r.pdf, { flag: a.overwrite ? 'w' : 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new PathPolicyError(`${target} already exists; pass overwrite: true to replace it.`);
        throw e;
      }
      return { content: [text(`Wrote ${r.pdf.length} bytes to ${target} (${r.conformanceLevel}, embeds ${r.xmlFilename}).`)], structuredContent: { ...meta, outputPath: target } };
    }
    const pdfBase64 = Buffer.from(r.pdf).toString('base64');
    return {
      content: [text(`Created a ${r.pdf.length}-byte PDF/A-3 (${r.conformanceLevel}, embeds ${r.xmlFilename}); base64 is in structuredContent.pdfBase64.`)],
      structuredContent: { ...meta, pdfBase64 },
    };
  }));

  server.registerTool('validate_invoice', {
    title: 'Validate an e-invoice',
    description:
      'Checks an e-invoice against the official rule sets, locally: XSD plus the EN 16931 Schematron, plus XRechnung (KoSIT) or Peppol BIS when the document declares it. '
      + 'Input: `xml` (CII, UBL Invoice or CreditNote) OR `pdfBase64` (a Factur-X/ZUGFeRD PDF; the embedded XML is validated). Syntax and profile are detected from the document (see `detected`). '
      + '`country` "FR" adds the French CTC rules (CII only); "DE" reports whether the profile is acceptable for German B2B (MINIMUM and BASIC WL are not). '
      + '`valid` is true only when no error-level rule failed and XSD passed. `ruleSets` lists exactly what ran: say so when reporting, never claim more than ran. '
      + 'Each entry of `failures` has the publisher\'s message and, for common rules, a plainLanguage explanation with a fix. `advisories` are warnings that do not fail the invoice. '
      + NOT_SUPPORTED,
    inputSchema: {
      ...xmlOrPdfInput,
      country: z.enum(['FR', 'DE']).optional().describe('Add a country layer on top of EN 16931.'),
      profile: z.enum(['en16931', 'xrechnung', 'peppol']).optional().describe('Force the rule set instead of reading it from BT-24.'),
      xsd: z.boolean().optional().describe('Run XSD validation too. Default true.'),
    },
    outputSchema: {
      valid: z.boolean(), origin: z.enum(['xml', 'pdf']), embeddedFilename: z.string().optional(),
      detected: z.object({
        syntax: z.string(), profile: z.string(), customizationId: z.string().optional(), businessProcess: z.string().optional(), variant: z.string().optional(),
      }),
      firedCount: z.number().describe('Schematron rules that fired across all rule sets.'),
      ruleSets: z.array(z.object({ id: z.string(), label: z.string(), source: z.string(), fired: z.number(), failed: z.number(), advisory: z.number() })),
      xsd: z.object({ ran: z.boolean(), schema: z.string().optional(), valid: z.boolean().optional(), errors: z.array(z.string()), skippedReason: z.string().optional() }),
      notices: z.array(z.object({ severity: z.string(), code: z.string(), message: z.string() })),
      failures: z.array(ruleResultShape), advisories: z.array(ruleResultShape),
    },
    annotations: { title: 'Validate an e-invoice', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    const r = await validate(sourceOf(a), { ...(a.country ? { country: a.country } : {}), ...(a.profile ? { profile: a.profile } : {}), ...(a.xsd !== undefined ? { xsd: a.xsd } : {}) });
    const failures = r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal');
    const advisories = r.results.filter((x) => x.severity === 'warning' || x.severity === 'info');
    const lines = [
      `${r.valid ? 'VALID' : 'INVALID'}: ${r.detected.syntax} / ${r.detected.profile}; rule sets run: ${r.ruleSets.map((s) => s.id).join(', ') || '(none)'}; ${r.firedCount} rules fired, ${failures.length} failed, ${advisories.length} advisory.`,
      r.xsd.ran ? `XSD (${r.xsd.schema ?? '?'}): ${r.xsd.valid ? 'passed' : `FAILED: ${r.xsd.errors.slice(0, 5).join(' | ')}`}` : `XSD not run: ${r.xsd.skippedReason ?? 'disabled'}`,
      ...r.notices.map((n) => `Notice [${n.severity}] ${n.code}: ${n.message}`),
      ...failures.map((f) => `[${f.severity.toUpperCase()}] ${f.ruleId}${f.fields.length ? ` (${f.fields.join(', ')})` : ''}: ${f.message}${f.plainLanguage ? `\n  Why: ${f.plainLanguage.why}\n  Fix: ${f.plainLanguage.fix}` : ''}`),
    ];
    return {
      content: [text(lines.join('\n'))],
      structuredContent: {
        valid: r.valid, origin: r.origin, ...(r.embeddedFilename ? { embeddedFilename: r.embeddedFilename } : {}),
        detected: r.detected, firedCount: r.firedCount, ruleSets: r.ruleSets, xsd: r.xsd, notices: r.notices, failures, advisories,
      },
    };
  }));

  server.registerTool('convert_invoice', {
    title: 'Convert an e-invoice between syntaxes',
    description:
      'Reads an existing e-invoice (CII, UBL, XRechnung or Peppol XML, or a Factur-X/ZUGFeRD PDF via pdfBase64) and writes it in another syntax. Pass `xml` OR `pdfBase64`, and `to`. '
      + `Targets: ${FORMAT_LIST}. Fields the target syntax cannot carry are not invented, so run validate_invoice on the result. To get a PDF from an XML, parse_invoice then create_invoice_pdf. ` + NOT_SUPPORTED,
    inputSchema: { ...xmlOrPdfInput, to: formatEnum },
    outputSchema: { xml: z.string(), format: z.enum(FORMAT_IDS), from: z.string().describe('Syntax of the source: cii, ubl-invoice or ubl-credit-note.'), warnings: z.array(z.string()) },
    annotations: { title: 'Convert an e-invoice between syntaxes', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    const r = await convert(sourceOf(a), a.to);
    return {
      content: [text(r.xml), ...(r.warnings.length ? [text(`Warnings:\n${r.warnings.map((w) => `- ${w}`).join('\n')}`)] : [])],
      structuredContent: { xml: r.xml, format: r.format, from: r.from, warnings: r.warnings },
    };
  }));

  server.registerTool('parse_invoice', {
    title: 'Parse an e-invoice into JSON',
    description:
      'Reads CII, UBL, XRechnung or Peppol XML (xml) or a Factur-X/ZUGFeRD PDF (pdfBase64) into the structured invoice model, the same shape create_invoice accepts. '
      + 'Money is in integer minor units. Use it to inspect or edit a received invoice, or to re-issue it with create_invoice. For a PDF, `visibleTotals` says whether the totals printed on the page match the embedded XML. '
      + 'It does not validate: call validate_invoice for that.',
    inputSchema: xmlOrPdfInput,
    outputSchema: {
      invoice: z.object({}).passthrough().describe('The Invoice object, in the shape of the create_invoice input schema.'),
      format: z.enum(['cii', 'ubl-invoice', 'ubl-credit-note']), origin: z.enum(['xml', 'pdf']), embeddedFilename: z.string().optional(),
      visibleTotals: z.object({}).passthrough().optional().describe('PDF only: comparison of the printed totals with the embedded XML.'),
    },
    annotations: { title: 'Parse an e-invoice into JSON', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    const r = await parse(sourceOf(a));
    const structured = JSON.parse(JSON.stringify({
      invoice: r.invoice, format: r.format, origin: r.origin, embeddedFilename: r.embeddedFilename, visibleTotals: r.visibleTotals,
    })) as Record<string, unknown>;
    return { content: [text(JSON.stringify(structured, null, 2))], structuredContent: structured };
  }));

  server.registerTool('get_country_requirements', {
    title: 'E-invoicing requirements for a country',
    description:
      'Returns what the sourced dataset says about e-invoicing in one country: mandates, dates, thresholds, required formats, official sources. '
      + `\`country\` is an ISO 3166-1 alpha-2 code. Supported: ${SUPPORTED_COUNTRIES.join(', ')}. \`conformoSupport\` says, per required format, whether THIS toolkit can generate, read and validate it (FatturaPA, KSeF and Facturae: no). `
      + 'Items with status "unverified" are not confirmed from an official source: say so. This is information, not legal advice.',
    inputSchema: { country: z.string().length(2).describe('ISO 3166-1 alpha-2 country code, e.g. DE, FR.') },
    outputSchema: z.object({
      country: z.string(),
      conformoSupport: z.record(z.object({ generate: z.boolean(), read: z.boolean(), validate: z.boolean(), note: z.string() })),
    }).passthrough().describe('The sourced country record (mandates, dates, thresholds, sources) plus conformoSupport.'),
    annotations: { title: 'E-invoicing requirements for a country', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    const r = getRequirements(a.country.toUpperCase());
    if (!r) return fail(`No data for country "${a.country}". Supported countries: ${SUPPORTED_COUNTRIES.join(', ')}.`);
    const structured = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    return { content: [text(JSON.stringify(structured, null, 2))], structuredContent: structured };
  }));

  server.registerTool('explain_validation_rule', {
    title: 'Explain a validation rule',
    description:
      'Explains a validation rule id such as "BR-CO-15", "BR-DE-15", "PEPPOL-EN16931-R003" or "BR-FR-05" as returned by validate_invoice: the publisher\'s official wording from the compiled rule sets, plus a plain-language summary, why it exists and how to fix it where one exists. '
      + 'If `found` is false the id is unknown here; do not guess an explanation.',
    inputSchema: { ruleId: z.string().min(1).describe('The rule id, e.g. BR-CO-15.') },
    outputSchema: {
      ruleId: z.string(), found: z.boolean(),
      official: z.array(z.object({ ruleSet: z.string(), text: z.string() })),
      plainLanguage: z.object({ summary: z.string(), why: z.string(), fix: z.string() }).optional(),
    },
    annotations: { title: 'Explain a validation rule', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (a) => guard(async () => {
    const r = explainRule(a.ruleId);
    const t = r.found
      ? [r.ruleId, ...r.official.map((o) => `${o.ruleSet}: ${o.text}`), ...(r.plainLanguage ? [`Meaning: ${r.plainLanguage.summary}`, `Why: ${r.plainLanguage.why}`, `Fix: ${r.plainLanguage.fix}`] : [])].join('\n')
      : `No rule "${r.ruleId}" is known to the compiled rule sets.`;
    return { content: [text(t)], structuredContent: JSON.parse(JSON.stringify(r)) as Record<string, unknown> };
  }));
}
