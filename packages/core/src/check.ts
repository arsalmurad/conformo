/**
 * Input validation for the Invoice model, with no dependencies. Run it before serializing: it names every
 * missing or malformed field with its BT/BG id, instead of letting a serializer fail with a TypeError or,
 * worse, emit a document that only the Schematron rejects later.
 *
 * checkInvoice() is NOT a compliance check. It only catches input the model cannot represent. Whether a
 * document is valid EN 16931 / XRechnung / Peppol is decided by the official Schematron (@conformo/validate).
 */
import type { Invoice } from './model.js';
import { CREDIT_NOTE_TYPE_CODES } from './model.js';
import { computedLineNet } from './totals.js';

export interface InvoiceIssue {
  /** Where, as a JS path into the input: "seller.country", "lines[2].quantity". */
  path: string;
  /** The EN 16931 business term or group, e.g. "BT-40" or "BG-25"; "" when none applies. */
  bt: string;
  /** error: cannot be serialized faithfully. warning: serializable but probably wrong. */
  severity: 'error' | 'warning';
  message: string;
}

/** Thrown by every serializer when checkInvoice() finds errors. Lists all of them, not just the first. */
export class InvoiceInputError extends Error {
  readonly issues: InvoiceIssue[];
  constructor(issues: InvoiceIssue[] | string) {
    const list: InvoiceIssue[] = typeof issues === 'string' ? [{ path: '', bt: '', severity: 'error', message: issues }] : issues;
    super(`Invalid invoice input (${list.length} problem${list.length === 1 ? '' : 's'}):\n` +
      list.map((i) => `  - ${i.path || '(invoice)'}${i.bt ? ` [${i.bt}]` : ''}: ${i.message}`).join('\n'));
    this.name = 'InvoiceInputError';
    this.issues = list;
  }
}

const CATEGORIES = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const blank = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function validDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function checkInvoice(input: unknown): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];
  const add = (severity: InvoiceIssue['severity'], path: string, bt: string, message: string) =>
    issues.push({ path, bt, severity, message });
  const err = (path: string, bt: string, message: string) => add('error', path, bt, message);

  if (!isObj(input)) {
    err('', '', `expected an invoice object, got ${input === null ? 'null' : typeof input}`);
    return issues;
  }
  const inv = input as unknown as Invoice;

  const needText = (v: unknown, path: string, bt: string, label: string) => {
    if (blank(v)) err(path, bt, `${label} is required`);
    else if (typeof v !== 'string') err(path, bt, `${label} must be a string`);
  };
  const optText = (v: unknown, path: string, bt: string, label: string) => {
    if (v !== undefined && v !== null && typeof v !== 'string') err(path, bt, `${label} must be a string`);
  };
  const optDate = (v: unknown, path: string, bt: string, label: string) => {
    if (blank(v)) return;
    if (typeof v !== 'string' || !validDate(v)) err(path, bt, `${label} must be a real date as yyyy-mm-dd, got ${JSON.stringify(v)}`);
  };
  const needNumber = (v: unknown, path: string, bt: string, label: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) err(path, bt, `${label} is required and must be a finite number`);
  };
  const minor = (v: unknown, path: string, bt: string, label: string, required: boolean) => {
    if (v === undefined || v === null) { if (required) err(path, bt, `${label} is required (integer minor units, e.g. 1999 for 19.99)`); return; }
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) err(path, bt, `${label} must be an integer in minor units (e.g. 1999 for 19.99), got ${JSON.stringify(v)}`);
  };

  const category = (v: unknown, path: string, bt: string) => {
    if (typeof v !== 'string' || !/^[A-Z]{1,2}$/.test(v)) err(path, bt, `VAT category must be a UNCL5305 code such as ${CATEGORIES.join(', ')}, got ${JSON.stringify(v)}`);
    else if (!CATEGORIES.includes(v)) add('warning', path, bt, `VAT category ${v} is not an EN 16931 category (${CATEGORIES.join(', ')}); only a national CIUS may use it`);
  };

  needText(inv.number, 'number', 'BT-1', 'invoice number');
  needText(inv.issueDate, 'issueDate', 'BT-2', 'issue date');
  if (typeof inv.issueDate === 'string' && inv.issueDate && !validDate(inv.issueDate)) err('issueDate', 'BT-2', `issue date must be a real date as yyyy-mm-dd, got ${JSON.stringify(inv.issueDate)}`);
  optDate(inv.dueDate, 'dueDate', 'BT-9', 'due date');
  optDate(inv.taxPointDate, 'taxPointDate', 'BT-7', 'tax point date');
  optDate(inv.periodStart, 'periodStart', 'BT-73', 'invoicing period start');
  optDate(inv.periodEnd, 'periodEnd', 'BT-74', 'invoicing period end');
  if (inv.taxPointDate && inv.taxPointDateCode) err('taxPointDate', 'BT-7', 'BT-7 and BT-8 are mutually exclusive (BR-CO-3)');
  if (typeof inv.currency !== 'string' || !CURRENCY.test(inv.currency)) err('currency', 'BT-5', `currency must be a 3-letter ISO 4217 code such as EUR, got ${JSON.stringify(inv.currency)}`);
  if (inv.typeCode !== undefined && (typeof inv.typeCode !== 'string' || !/^\d{2,3}$/.test(inv.typeCode))) err('typeCode', 'BT-3', `document type code must be a UNTDID 1001 code such as "380", got ${JSON.stringify(inv.typeCode)}`);
  if (inv.taxCurrency && inv.taxCurrency !== inv.currency) {
    if (!CURRENCY.test(inv.taxCurrency)) err('taxCurrency', 'BT-6', 'VAT accounting currency must be a 3-letter ISO 4217 code');
    if (inv.taxTotalInTaxCurrencyMinor === undefined) err('taxTotalInTaxCurrencyMinor', 'BT-111', 'is required when taxCurrency (BT-6) differs from currency (BR-53)');
  }
  minor(inv.taxTotalInTaxCurrencyMinor, 'taxTotalInTaxCurrencyMinor', 'BT-111', 'VAT total in accounting currency', false);
  minor(inv.prepaidMinor, 'prepaidMinor', 'BT-113', 'prepaid amount', false);
  minor(inv.roundingMinor, 'roundingMinor', 'BT-114', 'rounding amount', false);
  if (inv.typeCode && CREDIT_NOTE_TYPE_CODES.includes(inv.typeCode) === false && inv.typeCode !== '380' && !/^(71|80|82|84|102|130|202|203|204|211|218|219|295|325|326|331|382|383|384|385|386|387|388|389|390|393|394|395|456|457|471|472|473|500|501|527|553|575|623|633|751|780|817|870|875|876|877|935)$/.test(inv.typeCode)) {
    add('warning', 'typeCode', 'BT-3', `document type code ${inv.typeCode} is not on the EN 16931 list (BR-CL-01)`);
  }
  for (const k of ['buyerReference', 'projectReference', 'contractReference', 'orderReference', 'salesOrderReference', 'receivingAdviceReference',
    'despatchAdviceReference', 'tenderOrLotReference', 'invoicedObjectId', 'buyerAccountingReference', 'paymentTerms', 'businessProcess'] as const) {
    optText(inv[k], k, '', k);
  }

  const party = (p: unknown, path: string, who: 'seller' | 'buyer') => {
    const s = who === 'seller';
    if (!isObj(p)) { err(path, s ? 'BG-4' : 'BG-7', `${who} is required`); return; }
    const q = p as unknown as Invoice['seller'];
    needText(q.name, `${path}.name`, s ? 'BT-27' : 'BT-44', `${who} name`);
    if (typeof q.country !== 'string' || !COUNTRY.test(q.country)) err(`${path}.country`, s ? 'BT-40' : 'BT-55', `${who} country must be a 2-letter ISO 3166-1 code such as DE, got ${JSON.stringify(q.country)}`);
    if (q.legalId && !q.legalIdScheme) add('warning', `${path}.legalIdScheme`, s ? 'BT-30' : 'BT-47', 'legalId has no scheme: EN 16931 allows that, but Peppol, XRechnung and the French rules expect an ISO 6523 ICD code such as 0002. Conformo never invents one.');
    if (q.electronicAddress && !q.electronicAddressScheme && !q.electronicAddress.includes('@')) {
      err(`${path}.electronicAddressScheme`, s ? 'BT-34' : 'BT-49', 'is required unless electronicAddress is an e-mail address (an EAS code such as 0204 for a Leitweg-ID)');
    }
    (q.additionalIds ?? []).forEach((a, i) => { if (blank(a?.id)) err(`${path}.additionalIds[${i}].id`, s ? 'BT-29' : 'BT-46', 'identifier is required'); });
    if (q.contact !== undefined && !isObj(q.contact)) err(`${path}.contact`, s ? 'BG-6' : 'BG-9', 'must be an object');
  };
  party(inv.seller, 'seller', 'seller');
  party(inv.buyer, 'buyer', 'buyer');
  if (isObj(inv.seller) && !inv.seller.vatId && !inv.seller.taxRegistrationId && !inv.taxRepresentative && inv.lines?.some?.((l) => l?.taxCategory === 'S')) {
    add('warning', 'seller.vatId', 'BT-31', 'a standard-rated invoice needs the seller VAT id (BT-31), tax registration id (BT-32) or a tax representative (BR-S-02)');
  }
  if (inv.taxRepresentative !== undefined) {
    const t = inv.taxRepresentative;
    if (!isObj(t)) err('taxRepresentative', 'BG-11', 'must be an object');
    else {
      needText(t.name, 'taxRepresentative.name', 'BT-62', 'tax representative name');
      needText(t.vatId, 'taxRepresentative.vatId', 'BT-63', 'tax representative VAT id');
      if (typeof t.country !== 'string' || !COUNTRY.test(t.country)) err('taxRepresentative.country', 'BT-69', 'country must be a 2-letter ISO 3166-1 code');
    }
  }
  if (inv.payee !== undefined) {
    if (!isObj(inv.payee)) err('payee', 'BG-10', 'must be an object');
    else {
      needText(inv.payee.name, 'payee.name', 'BT-59', 'payee name');
      if (inv.payee.legalId && !inv.payee.legalIdScheme) add('warning', 'payee.legalIdScheme', 'BT-61', 'legalId has no scheme (an ISO 6523 ICD code is expected by most CIUS)');
    }
  }
  if (inv.delivery?.country !== undefined && !COUNTRY.test(inv.delivery.country)) err('delivery.country', 'BT-80', 'must be a 2-letter ISO 3166-1 code');
  optDate(inv.delivery?.date, 'delivery.date', 'BT-72', 'delivery date');
  (inv.precedingInvoices ?? []).forEach((r, i) => {
    needText(r?.number, `precedingInvoices[${i}].number`, 'BT-25', 'preceding invoice number');
    optDate(r?.issueDate, `precedingInvoices[${i}].issueDate`, 'BT-26', 'preceding invoice date');
  });
  (inv.notes ?? []).forEach((n, i) => needText(n?.text, `notes[${i}].text`, 'BT-22', 'note text'));

  if (inv.payment === undefined) add('warning', 'payment', 'BG-16', 'no payment instructions: XRechnung (BR-DE-1) and most buyers need payment.meansCode (BT-81), e.g. "58" for a SEPA credit transfer, and payment.iban (BT-84)');
  else if (!isObj(inv.payment)) err('payment', 'BG-16', 'must be an object with meansCode (BT-81), e.g. { meansCode: "58", iban: "DE89..." }');
  else {
    needText(inv.payment.meansCode, 'payment.meansCode', 'BT-81', 'payment means code (UNTDID 4461, e.g. "58")');
    if ((inv.payment.meansCode === '58' || inv.payment.meansCode === '30') && !inv.payment.iban) {
      add('warning', 'payment.iban', 'BT-84', `payment means ${inv.payment.meansCode} is a credit transfer but no IBAN (BT-84) is given (BR-50)`);
    }
    if (inv.payment.meansCode === '59' && !inv.payment.directDebit?.mandateId) {
      add('warning', 'payment.directDebit.mandateId', 'BT-89', 'payment means 59 (SEPA direct debit) normally needs the mandate reference (BT-89) and creditor id (BT-90)');
    }
    (inv.payment.additionalAccounts ?? []).forEach((a, i) => needText(a?.iban, `payment.additionalAccounts[${i}].iban`, 'BT-84', 'account identifier'));
    if (inv.payment.card && blank(inv.payment.card.pan)) err('payment.card.pan', 'BT-87', 'card number (last digits) is required');
  }

  (inv.attachments ?? []).forEach((a, i) => {
    needText(a?.id, `attachments[${i}].id`, 'BT-122', 'supporting document reference');
    if (a?.content && (blank(a.mimeCode) || blank(a.filename))) err(`attachments[${i}].mimeCode`, 'BT-125', 'an embedded attachment needs mimeCode (BT-125-1) and filename (BT-125-2)');
    if (a?.content && a.url) err(`attachments[${i}].url`, 'BT-124', 'give either content (BT-125) or url (BT-124), not both');
  });

  const ac = (list: unknown, path: string, doc: 'allowance' | 'charge') => {
    if (list === undefined) return;
    if (!Array.isArray(list)) { err(path, doc === 'allowance' ? 'BG-20' : 'BG-21', 'must be an array'); return; }
    list.forEach((a: Invoice['allowances'] extends (infer T)[] | undefined ? T : never, i: number) => {
      minor(a?.amountMinor, `${path}[${i}].amountMinor`, doc === 'allowance' ? 'BT-92' : 'BT-99', `${doc} amount`, true);
      if (typeof a?.amountMinor === 'number' && a.amountMinor < 0) add('warning', `${path}[${i}].amountMinor`, doc === 'allowance' ? 'BT-92' : 'BT-99', `${doc} amount is negative; EN 16931 expects a positive amount (a negative allowance is a charge)`);
      category(a?.taxCategory, `${path}[${i}].taxCategory`, doc === 'allowance' ? 'BT-95' : 'BT-102');
      needNumber(a?.taxRate, `${path}[${i}].taxRate`, doc === 'allowance' ? 'BT-96' : 'BT-103', 'VAT rate');
      if (blank(a?.reason) && blank(a?.reasonCode)) err(`${path}[${i}].reason`, doc === 'allowance' ? 'BT-97' : 'BT-104', `${doc} needs a reason text or reason code (BR-33/BR-38)`);
    });
  };
  ac(inv.allowances, 'allowances', 'allowance');
  ac(inv.charges, 'charges', 'charge');

  if (!Array.isArray(inv.lines) || inv.lines.length === 0) err('lines', 'BG-25', 'at least one invoice line is required (BR-16)');
  else {
    inv.lines.forEach((l, i) => {
      const p = `lines[${i}]`;
      if (!isObj(l)) { err(p, 'BG-25', 'must be an object'); return; }
      needText(l.name, `${p}.name`, 'BT-153', 'item name');
      needNumber(l.quantity, `${p}.quantity`, 'BT-129', 'quantity');
      if (typeof l.unitPriceMinor !== 'number' || !Number.isFinite(l.unitPriceMinor)) err(`${p}.unitPriceMinor`, 'BT-146', 'net unit price is required (minor units; may be fractional for sub-cent prices)');
      category(l.taxCategory, `${p}.taxCategory`, 'BT-151');
      if (l.taxCategory !== 'O') needNumber(l.taxRate, `${p}.taxRate`, 'BT-152', 'VAT rate');
      if (l.standardItemId && !l.standardItemIdScheme) err(`${p}.standardItemIdScheme`, 'BT-157', 'is required when standardItemId is set (e.g. 0160 for a GTIN)');
      if (l.originCountry !== undefined && !COUNTRY.test(l.originCountry)) err(`${p}.originCountry`, 'BT-159', 'must be a 2-letter ISO 3166-1 code');
      if (l.priceBaseQuantity !== undefined && !(typeof l.priceBaseQuantity === 'number' && l.priceBaseQuantity > 0)) err(`${p}.priceBaseQuantity`, 'BT-149', 'must be a number greater than 0');
      if (l.grossPriceMinor !== undefined && l.priceDiscountMinor !== undefined && typeof l.unitPriceMinor === 'number' &&
        Math.abs(l.grossPriceMinor - l.priceDiscountMinor - l.unitPriceMinor) > 1e-9) {
        add('warning', `${p}.unitPriceMinor`, 'BT-146', 'net price differs from gross price (BT-148) minus price discount (BT-147)');
      }
      if (typeof l.netAmountMinor === 'number' && Number.isFinite(l.unitPriceMinor) && Number.isFinite(l.quantity) &&
        l.netAmountMinor !== computedLineNet(l)) add('warning', `${p}.netAmountMinor`, 'BT-131', 'stated line net amount differs from quantity x price (+charges -allowances); the stated value is used');
      optDate(l.periodStart, `${p}.periodStart`, 'BT-134', 'line period start');
      optDate(l.periodEnd, `${p}.periodEnd`, 'BT-135', 'line period end');
      for (const [list, doc] of [[l.allowances, 'allowance'], [l.charges, 'charge']] as const) {
        (list ?? []).forEach((a, j) => {
          minor(a?.amountMinor, `${p}.${doc === 'allowance' ? 'allowances' : 'charges'}[${j}].amountMinor`, doc === 'allowance' ? 'BT-136' : 'BT-141', `line ${doc} amount`, true);
          if (blank(a?.reason) && blank(a?.reasonCode)) err(`${p}.${doc === 'allowance' ? 'allowances' : 'charges'}[${j}].reason`, doc === 'allowance' ? 'BT-139' : 'BT-144', `line ${doc} needs a reason text or reason code`);
        });
      }
      (l.classifications ?? []).forEach((c, j) => { if (blank(c?.code) || blank(c?.scheme)) err(`${p}.classifications[${j}]`, 'BT-158', 'code and scheme (BT-158-1) are required'); });
      (l.attributes ?? []).forEach((a, j) => { if (blank(a?.name) || blank(a?.value)) err(`${p}.attributes[${j}]`, 'BG-32', 'name (BT-160) and value (BT-161) are required'); });
    });
  }
  return issues;
}

/** Throws InvoiceInputError listing every error-severity issue; warnings do not throw. */
export function assertInvoice(input: unknown): asserts input is Invoice {
  const errors = checkInvoice(input).filter((i) => i.severity === 'error');
  if (errors.length) throw new InvoiceInputError(errors);
}
