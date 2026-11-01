import type { Invoice, InvoiceIssue } from '@conformo/core';
import { isValidLeitwegId } from '@conformo/formats';
import type { PlainLanguageMessage, RuleResult } from '@conformo/validate/browser';
import type { Audience } from '../audience.js';
import { noteText } from '../audience.js';
import { checkIban } from '../profiles/iban.js';

/**
 * One thing that stops the invoice from being accepted, attached to the form field that fixes it.
 *
 * Three sources feed it, and the download is gated on all three:
 * - input: checkInvoice() (@conformo/core) found a required EN 16931 term missing or malformed, so no XML can be built;
 * - client: this audience's own mandatory fields (audience.ts, each proven against its official rule by
 *   test/ui-audience.test.ts), the Leitweg-ID check digits and the IBAN checksum, known before the Schematron can run;
 * - rules: the official Schematron itself (EN 16931, KoSIT XRechnung, French CTC) run in the browser.
 */
export interface Problem {
  /** Field key, e.g. "seller.name", "lines.0.taxRate", "buyerReference"; or a section: "lines", "totals". */
  key: string;
  kind: 'missing' | 'invalid';
  source: 'input' | 'client' | 'rules';
  /** Rule id for the technical details: "BR-DE-15", "BR-CO-15", or the BT id for input issues. */
  ruleId?: string;
  /** Official rule text (or checkInvoice's message), shown only in technical details. */
  official?: string;
  plain?: PlainLanguageMessage;
  /** A message id from messages.ts that is more precise than "missing"/"invalid" for this key. */
  messageId?: string;
}

/** Reads the value behind a field key, to tell "still empty" from "filled in but wrong". */
export function valueAt(invoice: Invoice, key: string): unknown {
  if (key.startsWith('notes.')) return noteText(invoice, key.slice(6));
  const m = /^lines\.(\d+)\.(.+)$/.exec(key);
  if (m) return (invoice.lines[Number(m[1])] as unknown as Record<string, unknown> | undefined)?.[m[2]!];
  let cur: unknown = invoice;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// ------------------------------------------------------------------ input issues (checkInvoice)

/** "lines[2].taxRate" -> "lines.2.taxRate"; a few model paths land on the field that edits them. */
export function keyForPath(path: string): string {
  const k = path.replace(/\[(\d+)\]/g, '.$1');
  if (k === 'payment' || k === 'payment.meansCode') return 'payment.iban';
  if (k === 'lines') return 'lines.0.name';
  return k;
}

export function problemsFromInput(issues: InvoiceIssue[], invoice: Invoice): Problem[] {
  return issues
    .filter((i) => i.severity === 'error')
    .map((i) => {
      const key = keyForPath(i.path);
      return { key, kind: isEmpty(valueAt(invoice, key)) ? 'missing' : 'invalid', source: 'input', ruleId: i.bt || undefined, official: i.message } as Problem;
    });
}

// ------------------------------------------------------------------ official rule results

/** Rules whose official text names no BT, or names one that is not the field you fix. */
const FIELD_BY_RULE: Record<string, string> = {
  'PEPPOL-EN16931-R010': 'buyer.electronicAddress',
  'PEPPOL-EN16931-R020': 'seller.electronicAddress',
  'BR-DE-2': 'seller.contact.name',
  'BR-DE-5': 'seller.contact.name',
  'BR-DE-6': 'seller.contact.phone',
  'BR-DE-7': 'seller.contact.email',
  'BR-DE-15': 'buyerReference',
  'BR-FR-08': 'businessProcess',
  'BR-FR-10': 'seller.legalId',
  'BR-FR-12': 'buyer.electronicAddress',
  'BR-FR-13': 'seller.electronicAddress',
  'BR-S-02': 'seller.vatId',
  'BR-AE-02': 'buyer.vatId',
  'BR-AE-03': 'buyer.vatId',
  'BR-IC-02': 'buyer.vatId',
  'BR-IC-03': 'buyer.vatId',
};

const FIELD_BY_BT: Record<string, string> = {
  'BT-1': 'number', 'BT-2': 'issueDate', 'BT-5': 'currency', 'BT-9': 'dueDate', 'BT-10': 'buyerReference',
  'BT-20': 'paymentTerms', 'BT-23': 'businessProcess', 'BT-72': 'delivery.date',
  'BT-27': 'seller.name', 'BT-30': 'seller.legalId', 'BT-31': 'seller.vatId', 'BT-32': 'seller.taxRegistrationId',
  'BT-34': 'seller.electronicAddress', 'BT-35': 'seller.street', 'BT-37': 'seller.city', 'BT-38': 'seller.postcode', 'BT-40': 'seller.country',
  'BG-6': 'seller.contact.name', 'BT-41': 'seller.contact.name', 'BT-42': 'seller.contact.phone', 'BT-43': 'seller.contact.email',
  'BT-44': 'buyer.name', 'BT-48': 'buyer.vatId', 'BT-49': 'buyer.electronicAddress', 'BT-50': 'buyer.street', 'BT-52': 'buyer.city',
  'BT-53': 'buyer.postcode', 'BT-55': 'buyer.country',
  'BT-81': 'payment.iban', 'BT-84': 'payment.iban', 'BT-86': 'payment.bic', 'BG-16': 'payment.iban', 'BG-17': 'payment.iban',
};

const LINE_FIELD_BY_BT: Record<string, string> = {
  'BT-153': 'name', 'BT-129': 'quantity', 'BT-146': 'unitPriceMinor', 'BT-131': 'unitPriceMinor',
  'BT-151': 'taxCategory', 'BT-152': 'taxRate', 'BT-120': 'exemptionReason', 'BT-121': 'exemptionReason',
};

/** CII and UBL report the offending line as the n-th line element in the XPath (1-based). */
function lineIndexFromXpath(xpath: string): number | undefined {
  const m = /(?:IncludedSupplyChainTradeLineItem|InvoiceLine|CreditNoteLine)\[(\d+)\]/.exec(xpath);
  return m ? Number(m[1]) - 1 : undefined;
}

const EXEMPTION_RULE = /^BR-(E|AE|IC|G|O|Z)-10$/;
const CATEGORY_BY_FAMILY: Record<string, string> = { E: 'E', AE: 'AE', IC: 'K', G: 'G', O: 'O', Z: 'Z' };

export function keyForRule(r: RuleResult, invoice: Invoice): string {
  const base = r.ruleId.split(/[_/]/)[0]!;
  if (base === 'BR-FR-05') {
    const code = /_(AAB|PMD|PMT)$/.exec(r.ruleId)?.[1];
    if (code) return `notes.${code}`;
  }
  const byRule = FIELD_BY_RULE[base];
  if (byRule) return byRule;
  const fam = EXEMPTION_RULE.exec(base)?.[1];
  if (fam) {
    const i = invoice.lines.findIndex((l) => l.taxCategory === CATEGORY_BY_FAMILY[fam]);
    return `lines.${Math.max(0, i)}.exemptionReason`;
  }
  const line = lineIndexFromXpath(r.xpath);
  if (line !== undefined) {
    for (const bt of r.fields) if (LINE_FIELD_BY_BT[bt]) return `lines.${line}.${LINE_FIELD_BY_BT[bt]}`;
    return `lines.${line}.name`;
  }
  for (const bt of r.fields) if (FIELD_BY_BT[bt]) return FIELD_BY_BT[bt]!;
  for (const bt of r.fields) {
    const lf = LINE_FIELD_BY_BT[bt];
    if (lf) return `lines.0.${lf}`;
  }
  if (r.fields.some((f) => /^BT-(10[6-9]|11[0-5])$/.test(f) || /^B[TG]-(23|11[6-9]|12[01])$/.test(f))) return 'totals';
  return 'lines';
}

export function problemsFromRules(results: RuleResult[], invoice: Invoice): Problem[] {
  return results
    .filter((r) => r.severity === 'error' || r.severity === 'fatal')
    .map((r) => {
      const key = keyForRule(r, invoice);
      return {
        key,
        kind: key !== 'lines' && key !== 'totals' && isEmpty(valueAt(invoice, key)) ? 'missing' : 'invalid',
        source: 'rules',
        ruleId: r.ruleId,
        official: r.message,
        plain: r.plainLanguage,
      } as Problem;
    });
}

// ------------------------------------------------------------------ client checks

export function clientProblems(invoice: Invoice, audience: Audience): Problem[] {
  const out: Problem[] = [];
  for (const f of audience.required) {
    if (isEmpty(valueAt(invoice, f.key))) out.push({ key: f.key, kind: 'missing', source: 'client', ruleId: f.rule });
  }
  if (audience.id === 'de-b2g' && invoice.buyerReference && !isValidLeitwegId(invoice.buyerReference.trim())) {
    out.push({ key: 'buyerReference', kind: 'invalid', source: 'client', ruleId: 'BR-DE-15', messageId: 'leitwegInvalid' });
  }
  if (audience.id === 'fr-b2b' && invoice.seller.legalId && !/^\d{9}$/.test(invoice.seller.legalId.replace(/\s/g, ''))) {
    out.push({ key: 'seller.legalId', kind: 'invalid', source: 'client', ruleId: 'BR-FR-10', messageId: 'sirenInvalid' });
  }
  if (invoice.payment?.iban) {
    const r = checkIban(invoice.payment.iban);
    if (!r.valid) out.push({ key: 'payment.iban', kind: 'invalid', source: 'client', ruleId: 'IBAN', messageId: 'ibanInvalid', official: `This IBAN ${r.reason}.` });
  }
  return out;
}

/** One problem per field: the first source wins for the wording, the official rule id is kept from any source. */
export function mergeProblems(...lists: Problem[][]): Problem[] {
  const byKey = new Map<string, Problem>();
  for (const p of lists.flat()) {
    const prev = byKey.get(p.key);
    if (!prev) byKey.set(p.key, p);
    else if (!prev.official && p.official) byKey.set(p.key, { ...prev, official: p.official, ruleId: prev.ruleId ?? p.ruleId, plain: prev.plain ?? p.plain });
  }
  return [...byKey.values()];
}

/** Display order: the order fields appear in the form, so "fix the first problem" goes top to bottom. */
const FORM_ORDER = [
  'seller.name', 'seller.street', 'seller.postcode', 'seller.city', 'seller.country', 'seller.vatId', 'seller.taxRegistrationId', 'seller.legalId',
  'seller.electronicAddress', 'seller.contact.name', 'seller.contact.phone', 'seller.contact.email',
  'buyer.name', 'buyer.street', 'buyer.postcode', 'buyer.city', 'buyer.country', 'buyer.vatId', 'buyerReference', 'buyer.electronicAddress',
  'number', 'issueDate', 'delivery.date', 'dueDate', 'currency', 'businessProcess', 'lines', 'totals',
  'payment.iban', 'payment.bic', 'paymentTerms', 'notes.AAB', 'notes.PMD', 'notes.PMT',
];

export function formIndex(key: string): number {
  const line = /^lines\.(\d+)\.(.+)$/.exec(key);
  if (line) {
    const base = FORM_ORDER.indexOf('lines');
    const sub = ['name', 'quantity', 'unitPriceMinor', 'taxCategory', 'taxRate', 'exemptionReason'].indexOf(line[2]!);
    return base + (Number(line[1]) * 10 + Math.max(0, sub) + 1) / 1000;
  }
  const i = FORM_ORDER.indexOf(key);
  return i === -1 ? FORM_ORDER.length : i;
}

export function sortProblems(problems: Problem[]): Problem[] {
  return [...problems].sort((a, b) => formIndex(a.key) - formIndex(b.key));
}
