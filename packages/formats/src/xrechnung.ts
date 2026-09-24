/**
 * XRechnung 3.0 (the German CIUS), in both syntaxes.
 *
 * There is no XRechnung serializer as such. XRechnung is the `xrechnung` profile of
 * the CII and UBL serializers: same model, same bindings, a different BT-24 and BT-23.
 * What this file adds is the German-specific part: the Leitweg-ID, and a precondition
 * check that names the mandatory German terms a model is missing before you ship it.
 *
 * checkXRechnung() is NOT a validator and passing it proves nothing. The claim
 * "valid" comes from the official KoSIT Schematron (tools/validate.py), never from here.
 */
import type { Invoice } from '@verinvoice/core';
import { buildCII } from './cii.js';
import { buildUBL } from './ubl.js';

/**
 * Leitweg-ID: coarse address, optional fine address, check digits, hyphen separated.
 *   [2-12 digits] [ - up to 30 letters/digits ] - [2 digits]
 * The check digits are ISO 7064 MOD 97-10 over the ID without hyphens and without the
 * check digits themselves, letters mapped A=10 ... Z=35, exactly as for an IBAN.
 * This reproduces the published examples 992-90009-96 and 04011000-1234512345-06.
 */
const LEITWEG = /^(\d{2,12})(?:-([0-9A-Za-z]{1,30}))?-(\d{2})$/;

export function leitwegCheckDigits(idWithoutCheckDigits: string): string {
  const digits = [...idWithoutCheckDigits.replace(/-/g, '').toUpperCase()]
    .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
  return String(98n - (BigInt(`${digits}00`) % 97n)).padStart(2, '0');
}

/** True when the string has the Leitweg-ID shape, whether or not its check digits are right. */
export const looksLikeLeitwegId = (s: string): boolean => LEITWEG.test(s);

/** True only when the shape is right AND the check digits agree. */
export function isValidLeitwegId(s: string): boolean {
  const m = LEITWEG.exec(s);
  if (!m) return false;
  return leitwegCheckDigits(`${m[1]}${m[2] ?? ''}`) === m[3];
}

export interface XRechnungIssue {
  /** error: XRechnung requires this and the document will be rejected. warning: probably a mistake. */
  severity: 'error' | 'warning';
  /** The XRechnung / EN 16931 rule this corresponds to, so it can be searched. */
  rule: string;
  message: string;
}

/**
 * The mandatory German terms a model can lack. Deliberately short: only rules where
 * the fix is a missing field. Everything else is the Schematron's job.
 */
export function checkXRechnung(invoice: Invoice): XRechnungIssue[] {
  const issues: XRechnungIssue[] = [];
  const add = (severity: XRechnungIssue['severity'], rule: string, message: string) =>
    issues.push({ severity, rule, message });

  if (!invoice.buyerReference) {
    add('error', 'BR-DE-15', 'buyerReference (BT-10) is mandatory. For public-sector buyers it is the Leitweg-ID.');
  } else if (looksLikeLeitwegId(invoice.buyerReference) && !isValidLeitwegId(invoice.buyerReference)) {
    add('warning', 'BR-DE-15',
      `buyerReference "${invoice.buyerReference}" has the Leitweg-ID shape but its check digits are wrong ` +
      `(expected ${leitwegCheckDigits(invoice.buyerReference.replace(/-\d{2}$/, ''))}).`);
  }
  const c = invoice.seller.contact;
  if (!c?.name) add('error', 'BR-DE-2/5', 'seller.contact.name (BT-41) is mandatory: BG-6 must be present.');
  if (!c?.phone) add('error', 'BR-DE-2/6', 'seller.contact.phone (BT-42) is mandatory.');
  if (!c?.email) add('error', 'BR-DE-2/7', 'seller.contact.email (BT-43) is mandatory.');
  if (!invoice.seller.city) add('error', 'BR-DE-3', 'seller.city (BT-37) is mandatory.');
  if (!invoice.seller.postcode) add('error', 'BR-DE-4', 'seller.postcode (BT-38) is mandatory.');
  if (!invoice.buyer.city) add('error', 'BR-DE-8', 'buyer.city (BT-52) is mandatory.');
  if (!invoice.buyer.postcode) add('error', 'BR-DE-9', 'buyer.postcode (BT-53) is mandatory.');
  if (!invoice.seller.vatId && !invoice.seller.taxRegistrationId && !invoice.taxRepresentative) {
    add('error', 'BR-S-02', 'seller needs vatId (BT-31), taxRegistrationId (BT-32) or a taxRepresentative (BT-63).');
  }
  return issues;
}

export class XRechnungError extends Error {
  constructor(readonly issues: XRechnungIssue[]) {
    super(`not serializable as XRechnung:\n${issues.map((i) => `  [${i.rule}] ${i.message}`).join('\n')}`);
    this.name = 'XRechnungError';
  }
}

function assertXRechnung(invoice: Invoice): void {
  const errors = checkXRechnung(invoice).filter((i) => i.severity === 'error');
  if (errors.length) throw new XRechnungError(errors);
}

/** XRechnung 3.0, CII flavour. Throws XRechnungError if a mandatory German term is missing. */
export function buildXRechnungCII(invoice: Invoice): string {
  assertXRechnung(invoice);
  return buildCII(invoice, { profile: 'xrechnung' });
}

/** XRechnung 3.0, UBL flavour. Throws XRechnungError if a mandatory German term is missing. */
export function buildXRechnungUBL(invoice: Invoice): string {
  assertXRechnung(invoice);
  return buildUBL(invoice, { profile: 'xrechnung' });
}
