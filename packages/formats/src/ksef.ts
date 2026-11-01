/**
 * Polish KSeF FA(3) serializer (schema FA(3) v1-0E, Ministry of Finance). GENERATION ONLY: Conformo does not submit to KSeF.
 *
 * Scope, deliberately narrow so that what is written is right: domestic invoices in PLN (type 380), VAT categories
 * S at 23 / 8 / 5 %, Z (0 %, domestic) and E (exempt). Anything else (foreign currency, credit notes, reverse charge,
 * intra-community, OSS, margin schemes ...) throws InvoiceInputError naming the unsupported term instead of producing a
 * plausible-looking but wrong document. The schema is checked by @conformo/validate (XSD only: KSeF applies its own
 * business rules on submission, which Conformo cannot predict).
 *
 * Element order follows the schema's xs:sequence. Timestamps come from the invoice's issue date, never a clock.
 */
import { InvoiceInputError, assertInvoice, lineNet, totals } from '@conformo/core';
import type { Invoice, InvoiceIssue, Party } from '@conformo/core';
import { dec, money, price, req, tag, wrap } from './xml.js';

export const KSEF_FA3_NS = 'http://crd.gov.pl/wzor/2025/06/25/13775/';

const unsupported = (path: string, bt: string, message: string): InvoiceIssue => ({ path, bt, severity: 'error', message: `KSeF FA(3): ${message}` });

const nipOf = (vat?: string): string | undefined => {
  const v = vat?.replace(/\s|-/g, '').toUpperCase();
  return v?.startsWith('PL') ? v.slice(2) : undefined;
};

const address = (p: Party): string => wrap('Adres',
  req('KodKraju', p.country) +
  req('AdresL1', [p.street, p.street2].filter(Boolean).join(', ') || p.city) +
  tag('AdresL2', [p.postcode, p.city].filter(Boolean).join(' ') || undefined));

const contact = (p: Party): string => p.contact?.email || p.contact?.phone
  ? wrap('DaneKontaktowe', tag('Email', p.contact?.email) + tag('Telefon', p.contact?.phone)) : '';

// P_13_x / P_14_x field by (category, rate); P_12 text per line.
function slot(category: string, rate: number): { net: string; vat?: string; p12: string } | undefined {
  if (category === 'S' && rate === 23) return { net: 'P_13_1', vat: 'P_14_1', p12: '23' };
  if (category === 'S' && rate === 8) return { net: 'P_13_2', vat: 'P_14_2', p12: '8' };
  if (category === 'S' && rate === 5) return { net: 'P_13_3', vat: 'P_14_3', p12: '5' };
  if (category === 'Z' && rate === 0) return { net: 'P_13_6_1', p12: '0 KR' };
  if (category === 'E') return { net: 'P_13_7', p12: 'zw' };
  return undefined;
}
const ORDER = ['P_13_1', 'P_13_2', 'P_13_3', 'P_13_6_1', 'P_13_7'];

export function buildKsefFa3(invoice: Invoice): string {
  assertInvoice(invoice);
  const issues: InvoiceIssue[] = [];
  if (invoice.currency !== 'PLN') issues.push(unsupported('currency', 'BT-5', 'only PLN invoices are supported (foreign-currency FA(3) needs the P_14_xW amounts)'));
  if ((invoice.typeCode ?? '380') !== '380') issues.push(unsupported('typeCode', 'BT-3', `only invoice type 380 is supported, got ${invoice.typeCode} (corrections need the KOR structure)`));
  invoice.lines.forEach((l, i) => {
    if (!slot(l.taxCategory, l.taxRate)) issues.push(unsupported(`lines[${i}].taxCategory`, 'BT-151', `VAT category ${l.taxCategory} at ${l.taxRate}% is not supported (supported: S at 23/8/5, Z at 0, E)`));
    if (l.allowances?.length || l.charges?.length) issues.push(unsupported(`lines[${i}]`, 'BG-27', 'line allowances and charges are not supported'));
  });
  if (invoice.allowances?.length || invoice.charges?.length) issues.push(unsupported('allowances', 'BG-20', 'document-level allowances and charges are not supported'));
  const sellerNip = nipOf(invoice.seller.vatId) ?? invoice.seller.taxRegistrationId?.replace(/\D/g, '');
  if (!sellerNip) issues.push(unsupported('seller.vatId', 'BT-31', 'the seller needs a Polish NIP (vatId "PL1234567890")'));
  if (issues.length) throw new InvoiceInputError(issues);

  const t = totals(invoice);
  const groups = new Map<string, { net: number; vat: number; vatField?: string; reason?: string }>();
  for (const g of t.groups) {
    const s = slot(g.category, g.rate)!;
    const cur = groups.get(s.net) ?? { net: 0, vat: 0, vatField: s.vat, reason: g.exemptionReason };
    cur.net += g.basis; cur.vat += g.amount;
    groups.set(s.net, cur);
  }
  const sums = ORDER.filter((f) => groups.has(f)).map((f) => {
    const g = groups.get(f)!;
    return req(f, money(g.net)) + (g.vatField ? req(g.vatField, money(g.vat)) : '');
  }).join('');
  const exempt = groups.get('P_13_7');

  const buyerNip = nipOf(invoice.buyer.vatId);
  const buyerVat = invoice.buyer.vatId?.replace(/\s|-/g, '').toUpperCase();
  const buyerId = buyerNip ? req('NIP', buyerNip)
    : buyerVat && /^[A-Z]{2}/.test(buyerVat) && invoice.buyer.country !== 'PL' ? req('KodUE', buyerVat.slice(0, 2)) + req('NrVatUE', buyerVat.slice(2))
    : req('BrakID', '1');

  const pay = invoice.payment;
  const payment = (invoice.dueDate || pay?.iban)
    ? wrap('Platnosc',
        (invoice.dueDate ? wrap('TerminPlatnosci', req('Termin', invoice.dueDate)) : '') +
        tag('FormaPlatnosci', pay?.meansCode === '58' || pay?.meansCode === '30' ? '6' : pay?.meansCode === '48' ? '3' : undefined) +
        (pay?.iban ? wrap('RachunekBankowy', req('NrRB', pay.iban.replace(/\s/g, '')) + tag('NazwaBanku', pay.accountName)) : ''))
    : '';

  const lines = invoice.lines.map((l, i) => wrap('FaWiersz',
    req('NrWierszaFa', String(i + 1)) +
    req('P_7', l.name) +
    tag('P_8A', l.unitCode === 'C62' ? 'szt.' : l.unitCode) +
    req('P_8B', dec(l.quantity)) +
    req('P_9A', price(l.unitPriceMinor)) +
    req('P_11', money(lineNet(l))) +
    req('P_12', slot(l.taxCategory, l.taxRate)!.p12))).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Faktura xmlns="${KSEF_FA3_NS}">` +
    wrap('Naglowek',
      '<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>' +
      req('WariantFormularza', '3') +
      req('DataWytworzeniaFa', `${invoice.issueDate}T00:00:00Z`) +
      req('SystemInfo', 'Conformo')) +
    wrap('Podmiot1', wrap('DaneIdentyfikacyjne', req('NIP', sellerNip!) + req('Nazwa', invoice.seller.name)) + address(invoice.seller) + contact(invoice.seller)) +
    wrap('Podmiot2', wrap('DaneIdentyfikacyjne', buyerId + req('Nazwa', invoice.buyer.name)) + address(invoice.buyer) + contact(invoice.buyer) + req('JST', '2') + req('GV', '2')) +
    wrap('Fa',
      req('KodWaluty', invoice.currency) +
      req('P_1', invoice.issueDate) +
      req('P_2', invoice.number) +
      sums +
      req('P_15', money(t.grand)) +
      wrap('Adnotacje',
        req('P_16', '2') + req('P_17', '2') + req('P_18', '2') + req('P_18A', '2') +
        wrap('Zwolnienie', exempt ? req('P_19', '1') + req('P_19A', exempt.reason ?? 'zwolnienie') : req('P_19N', '1')) +
        wrap('NoweSrodkiTransportu', req('P_22N', '1')) +
        req('P_23', '2') +
        wrap('PMarzy', req('P_PMarzyN', '1'))) +
      req('RodzajFaktury', 'VAT') +
      lines +
      payment) +
    `</Faktura>`;
}
