/**
 * Minimal XML string building shared by every serializer. No dependencies: the
 * formats package may import only @conformo/core.
 */
import { decimalToString, toMajor } from '@conformo/core';
import type { Invoice, Party } from '@conformo/core';

/**
 * Escapes text content and attribute values. Also drops the characters XML 1.0
 * cannot represent at all (most C0 controls, U+FFFE, U+FFFF): pasted text often
 * carries a stray \u0000 or \u001B, and one such character makes the whole document
 * unparseable for every downstream reader.
 */
export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Attrs = Record<string, unknown>;

const attrString = (attrs: Attrs): string =>
  Object.entries(attrs).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

/** A leaf element, or '' when there is no value. Use for OPTIONAL business terms. */
export const tag = (name: string, value?: unknown, attrs: Attrs = {}): string =>
  value == null || value === '' ? '' : `<${name}${attrString(attrs)}>${esc(value)}</${name}>`;

/** A leaf element that must appear even when empty. Use for mandatory ones. */
export const req = (name: string, value?: unknown, attrs: Attrs = {}): string =>
  value == null || value === '' ? `<${name}${attrString(attrs)}/>` : tag(name, value, attrs);

/** A parent element, or '' when every child was optional and absent. */
export const wrap = (name: string, inner: string): string => (inner ? `<${name}>${inner}</${name}>` : '');

/** ISO yyyy-mm-dd -> CII format 102 (yyyymmdd). */
export const date102 = (iso: string): string => iso.replace(/-/g, '');

/** A decimal as xs:decimal text: no exponent, no trailing zeros. */
export const dec = (x: number | string): string => decimalToString(x);

export const money = (minor: number): string => toMajor(minor);

/** Thrown for input the serializers cannot represent faithfully. */
export class InvoiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceInputError';
  }
}

/**
 * Refuses input that would otherwise be serialized into a silently wrong document.
 * A legal id without a scheme used to be labelled 0002 (French SIREN) by default,
 * which misdeclares any non-French id and triggers the 9-digit SIREN rule on it.
 */
export function assertSerializable(invoice: Invoice): void {
  const party = (p: Party, who: string) => {
    if (p.legalId && !p.legalIdScheme) {
      throw new InvoiceInputError(
        `${who}.legalIdScheme is required when legalId is set (BT-30/BT-47 need an ISO 6523 ICD code such as 0002)`);
    }
    if (p.electronicAddress && !p.electronicAddressScheme && !p.electronicAddress.includes('@')) {
      throw new InvoiceInputError(
        `${who}.electronicAddressScheme is required unless electronicAddress is an e-mail (BT-34/BT-49 need an EAS code)`);
    }
  };
  party(invoice.seller, 'seller');
  party(invoice.buyer, 'buyer');
  for (const [i, l] of invoice.lines.entries()) {
    if (l.standardItemId && !l.standardItemIdScheme) {
      throw new InvoiceInputError(`lines[${i}].standardItemIdScheme is required when standardItemId is set (BT-157-1)`);
    }
  }
  if (invoice.taxCurrency && invoice.taxCurrency !== invoice.currency &&
      invoice.taxTotalInTaxCurrencyMinor === undefined) {
    throw new InvoiceInputError('taxTotalInTaxCurrencyMinor (BT-111) is required when taxCurrency (BT-6) is set (BR-53)');
  }
}

export const electronicAddressScheme = (p: Party): string | undefined =>
  p.electronicAddress ? (p.electronicAddressScheme ?? 'EM') : undefined;
