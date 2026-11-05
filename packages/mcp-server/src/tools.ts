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
  checkInvoice, convert, createPdf, createXml, explainRule, getRequirements, groupHeading, groupResults, parse, validate,
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

const plainLanguageShape = z.object({
  summary: z.string().describe('What the rule requires, in plain language.'),
  why: z.string().describe('Why the rule exists or why it typically fires.'),
  fix: z.string().describe('How to change the invoice so the rule passes.'),
});

const ruleResultShape = z.object({
  ruleId: z.string().describe('Rule id from the publisher, e.g. BR-CO-15 or BR-DE-15.'),
  severity: z.enum(['error', 'fatal', 'warning', 'info']).describe("error and fatal fail the invoice; warning and info do not. Effective level after the publisher's own re-levelling."),
  message: z.string().describe("The publisher's own message for this rule."),
  fields: z.array(z.string()).describe('BT and BG ids named in the official message, in order.'),
  xpath: z.string().describe('Where in the XML the rule fired.'),
  ruleSet: z.string().describe('Id of the rule set the rule belongs to (see ruleSets).'),
  plainLanguage: plainLanguageShape.optional().describe('Plain-language explanation and fix, present for common rules and for the syntax rules (CII-DT, CII-SR, UBL-CR, UBL-DT, UBL-SR).'),
  element: z.string().optional().describe('The offending element without namespaces, e.g. LineTotalAmount.'),
  path: z.string().optional().describe('A short readable path, e.g. "line 1 > NetPriceProductTradePrice > ChargeAmount". xpath is the exact location.'),
  line: z.number().int().optional().describe('1-based invoice line number when the node is inside an invoice line.'),
});

export function registerTools(server: McpServer): void {
  server.registerTool('create_invoice', {
    title: 'Create an e-invoice (XML)',
    description:
      'Builds e-invoice XML from structured invoice data: EN 16931 CII or UBL, XRechnung (CII or UBL) or Peppol BIS Billing 3.0, chosen by `format`. '
      + 'Use it for a new invoice that software will read. For a printable PDF with the XML inside, use create_invoice_pdf; to change the syntax of an invoice you already have, use convert_invoice. '
      + 'Pass `invoice` as a JSON object, not a string. Every money field ends in "Minor" and is an integer in minor units (EUR 12.34 = 1234); totals and the VAT breakdown are computed, so do not send them. '
      + 'If fields are missing or wrong it returns an error listing every problem (path, BT id, message) and produces nothing; fix them all and call again. '
      + 'It runs locally and does not send the invoice anywhere. It does not run the official rule sets: call validate_invoice on the XML before it goes out.',
    inputSchema: { invoice: invoiceSchema.describe('The invoice. Required: number, issueDate, currency, seller, buyer, lines.'), format: formatEnum },
    outputSchema: {
      xml: z.string().describe('The e-invoice XML, ready to send or to pass to validate_invoice.'),
      format: z.enum(FORMAT_IDS).describe('The syntax that was written.'),
      warnings: z.array(z.string()).describe('Non-fatal findings, e.g. a missing XRechnung precondition.'),
    },
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
      'Builds a Factur-X / ZUGFeRD invoice: a PDF/A-3b page a person can read, with the EN 16931 XML embedded for software. '
      + 'Use it when the invoice goes to a person or by e-mail. For XML only, such as an XRechnung uploaded to a German public-sector portal, use create_invoice. '
      + 'Takes the same `invoice` object as create_invoice, money in integer minor units. `language` changes only the printed labels; the embedded XML is identical in every language. '
      + 'By default the PDF comes back as base64, which can be large; pass `outputPath` to write the file instead. Writing stays inside the server\'s working directory and never replaces an existing file unless `overwrite` is true. '
      + 'The same input always gives the same bytes, and nothing is sent anywhere. Check the result with validate_invoice (pass pdfBase64).',
    inputSchema: {
      invoice: invoiceSchema.describe('The invoice. Required: number, issueDate, currency, seller, buyer, lines.'),
      profile: z.enum(PDF_PROFILES).optional().describe('Factur-X / ZUGFeRD profile. Default en16931.'),
      template: z.enum(['classic', 'modern', 'compact']).optional().describe('Page layout. Default classic.'),
      language: z.enum(PDF_LANGUAGES).optional().describe('Language of the printed labels: en, de or fr. Default en. Presentation only; the XML does not change.'),
      outputPath: z.string().optional().describe('Write the PDF here instead of returning base64. Relative to the server working directory; must end in .pdf.'),
      overwrite: z.boolean().optional().describe('Allow replacing an existing file at outputPath. Default false.'),
    },
    outputSchema: {
      profile: z.enum(PDF_PROFILES).describe('The Factur-X / ZUGFeRD profile written.'),
      xmlFilename: z.string().describe('Name of the embedded XML attachment.'),
      conformanceLevel: z.string().describe('Conformance level declared in the PDF metadata, e.g. EN 16931.'),
      byteLength: z.number().describe('Size of the PDF in bytes.'),
      sha256: z.string().describe('SHA-256 of the PDF bytes, hex; equal for equal input.'),
      warnings: z.array(z.string()).describe('Non-fatal findings about the invoice data.'),
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
      'Checks an e-invoice against the official rule sets on this machine: the XSD, the EN 16931 Schematron from CEN, and the KoSIT XRechnung or Peppol BIS rules when the document declares them. '
      + 'Use it before sending an invoice you created and when you receive one. To read the invoice\'s data use parse_invoice; to explain one failed rule in depth use explain_validation_rule. '
      + 'Accepts XML or a Factur-X / ZUGFeRD PDF, whose embedded XML is checked; syntax and profile are detected from the document. '
      + 'A `valid` result means the listed `ruleSets` passed, not that a tax authority or buyer will accept the invoice, so report which rule sets ran and never claim more. '
      + 'Each failure carries the publisher\'s message and, for common rules, a plain-language fix. Input that is not an invoice comes back as an error result, not as invalid. The check runs offline; nothing is uploaded.',
    inputSchema: {
      ...xmlOrPdfInput,
      country: z.enum(['FR', 'DE']).optional().describe('Add a country layer: "FR" runs the French CTC rules (CII only); "DE" reports whether the profile is acceptable for German B2B (MINIMUM and BASIC WL are not).'),
      profile: z.enum(['en16931', 'xrechnung', 'peppol']).optional().describe('Force the rule set instead of reading it from BT-24.'),
      xsd: z.boolean().optional().describe('Run XSD validation too. Default true.'),
    },
    outputSchema: {
      valid: z.boolean().describe('True only when no error-level rule failed, the XSD did not fail, and no error-level notice was raised.'),
      origin: z.enum(['xml', 'pdf']).describe('Whether the input was XML or a PDF.'),
      embeddedFilename: z.string().optional().describe('PDF only: name of the embedded XML that was checked.'),
      detected: z.object({
        syntax: z.string().describe('cii, ubl-invoice or ubl-credit-note.'),
        profile: z.string().describe('Profile read from BT-24: en16931, xrechnung, peppol, extended, minimum, basicwl or unknown.'),
        customizationId: z.string().optional().describe('The BT-24 specification identifier as written in the document.'),
        businessProcess: z.string().optional().describe('BT-23 business process, when present.'),
        variant: z.string().optional().describe('XRechnung only: standard, extension or cvd.'),
      }).describe('What the document declares about itself.'),
      firedCount: z.number().describe('Schematron rules that fired across all rule sets.'),
      ruleSets: z.array(z.object({
        id: z.string().describe('Rule set id, e.g. en16931-cii or xrechnung-cii.'),
        label: z.string().describe('Human-readable name.'),
        source: z.string().describe('Publisher and version of the official artefact that ran.'),
        fired: z.number().describe('Rules of this set that applied to the document.'),
        failed: z.number().describe('Error-level rules that failed.'),
        advisory: z.number().describe('Warning or info rules that fired without failing the invoice.'),
      })).describe('Exactly the rule sets that ran. Report these; do not claim checks that are not listed.'),
      xsd: z.object({
        ran: z.boolean().describe('Whether XSD validation ran.'),
        schema: z.string().optional().describe('The XSD used.'),
        valid: z.boolean().optional().describe('XSD verdict, when it ran.'),
        errors: z.array(z.string()).describe('XSD errors, empty when valid.'),
        skippedReason: z.string().optional().describe('Why XSD did not run, when it did not.'),
      }).describe('XML Schema check.'),
      notices: z.array(z.object({ severity: z.string(), code: z.string(), message: z.string() })).describe('Findings about the document that are not Schematron rules, e.g. an unrecognised profile, or (with country DE) a profile not acceptable for German B2B. An error-level notice makes valid false.'),
      failures: z.array(ruleResultShape).describe('Error-level rules that failed; any entry makes valid false.'),
      advisories: z.array(ruleResultShape).describe('Warning or info rules that fired; they do not make the invoice invalid.'),
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
      // Repeated hits of one rule are one entry ("CII-DT-031, 12 places: ..."); structuredContent keeps one entry per hit.
      ...groupResults(failures).map((g) => `[${g.severity.toUpperCase()}] ${g.count > 1 ? groupHeading(g) : g.ruleId}${g.fields.length ? ` (${g.fields.join(', ')})` : ''}: ${g.message}${g.count === 1 && g.places[0]?.path ? ` [${g.places[0].path}]` : ''}${g.plainLanguage ? `\n  Why: ${g.plainLanguage.why}\n  Fix: ${g.plainLanguage.fix}` : ''}`),
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
      'Rewrites an existing e-invoice in another syntax, for example CII to UBL, or plain EN 16931 to XRechnung or Peppol BIS. '
      + 'Use it when you already hold an invoice document. To build one from data use create_invoice; to get a PDF from XML use parse_invoice, then create_invoice_pdf. '
      + 'Accepts XML or a Factur-X / ZUGFeRD PDF. Nothing is invented: a target such as XRechnung may need data the source lacks, so read `warnings` and run validate_invoice on the result. '
      + 'A document it cannot read comes back as an error result with the reason. Runs locally; nothing is sent anywhere.',
    inputSchema: { ...xmlOrPdfInput, to: formatEnum },
    outputSchema: {
      xml: z.string().describe('The invoice in the target syntax.'),
      format: z.enum(FORMAT_IDS).describe('The syntax that was written.'),
      from: z.string().describe('Syntax of the source: cii, ubl-invoice or ubl-credit-note.'),
      warnings: z.array(z.string()).describe('Non-fatal findings, e.g. data the target requires that the source does not have.'),
    },
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
      'Reads an e-invoice (CII, UBL, XRechnung or Peppol XML, or a Factur-X / ZUGFeRD PDF) into the structured invoice object that create_invoice accepts, with money in integer minor units. '
      + 'Use it to answer questions about a received invoice, to edit one, or to re-issue it with create_invoice. It does not check any rules, so use validate_invoice for that, and convert_invoice to change syntax directly. '
      + 'For a PDF, `visibleTotals` shows whether the totals printed on the page match the embedded XML, which exposes a tampered or mismatched PDF. A document it cannot read comes back as an error result with the reason. Runs locally.',
    inputSchema: xmlOrPdfInput,
    outputSchema: {
      invoice: z.object({}).passthrough().describe('The Invoice object, in the shape of the create_invoice input schema.'),
      format: z.enum(['cii', 'ubl-invoice', 'ubl-credit-note']).describe('Syntax of the source document.'),
      origin: z.enum(['xml', 'pdf']).describe('Whether the input was XML or a PDF.'),
      embeddedFilename: z.string().optional().describe('PDF only: name of the embedded XML that was read.'),
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
      'Looks up the e-invoicing rules for one country in a sourced dataset: B2G and B2B mandates for issuing and receiving, start dates, turnover thresholds, required formats and official sources. '
      + 'Use it before create_invoice to decide which format a buyer in that country needs, or to answer when a mandate applies. It says nothing about a specific invoice; use validate_invoice to check one. '
      + `Covers ${SUPPORTED_COUNTRIES.join(', ')}. \`conformoSupport\` says per format whether this server can create, read and validate it. `
      + 'Entries marked unverified are not confirmed from an official source; say so. Information, not legal advice. Reads a bundled dataset; no network.',
    inputSchema: { country: z.string().length(2).describe('ISO 3166-1 alpha-2 country code, e.g. DE, FR.') },
    outputSchema: z.object({
      country: z.string().describe('ISO 3166-1 alpha-2 code of the country returned.'),
      conformoSupport: z.record(z.object({
        generate: z.boolean().describe('This server can create the format.'),
        read: z.boolean().describe('This server can read the format.'),
        validate: z.boolean().describe('This server can validate the format.'),
        note: z.string().describe('Limits that apply.'),
      })).describe('Per required format, what this server can do with it.'),
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
      'Explains one validation rule id, such as BR-CO-15, BR-DE-15, PEPPOL-EN16931-R003 or BR-FR-05: the publisher\'s official wording from the compiled rule sets and, where available, a plain-language summary, the reason for the rule and how to fix it. '
      + 'Use it after validate_invoice reports a rule you need to explain or fix, or when a user asks what a rule means. It does not check an invoice; call validate_invoice for that. '
      + 'An unknown id is not an error: the result has `found` false and an empty `official` list; say so and do not guess. Reads the bundled rule sets; no network.',
    inputSchema: { ruleId: z.string().min(1).describe('The rule id, e.g. BR-CO-15.') },
    outputSchema: {
      ruleId: z.string().describe('The rule id as looked up.'),
      found: z.boolean().describe('False when no compiled rule set knows this id.'),
      official: z.array(z.object({
        ruleSet: z.string().describe('Rule set containing the rule.'),
        text: z.string().describe("The publisher's wording of the rule."),
      })).describe('Official wording, one entry per rule set that defines the id.'),
      plainLanguage: plainLanguageShape.optional().describe('Plain-language explanation, when one exists for this rule.'),
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
