/**
 * Minimal XML string building shared by every serializer. No dependencies: the
 * formats package may import only @conformo/core.
 */
import { decimalToString, priceToMajor, toMajor } from '@conformo/core';
import type { Party } from '@conformo/core';

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

export { InvoiceInputError, assertInvoice, checkInvoice } from '@conformo/core';
export type { InvoiceIssue } from '@conformo/core';

/** Price (BT-146 etc.) in major units, exact, however many decimals it has. */
export const price = (minor: number): string => priceToMajor(minor);

export const electronicAddressScheme = (p: Party): string | undefined =>
  p.electronicAddress ? (p.electronicAddressScheme ?? 'EM') : undefined;
