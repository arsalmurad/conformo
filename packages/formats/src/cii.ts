/**
 * EN 16931 CII (UN/CEFACT Cross Industry Invoice) serializer.
 *
 * ELEMENT ORDER IS LOAD-BEARING. The XSD is xs:sequence throughout, so a
 * correctly-populated document in the wrong order is rejected. Two traps that
 * cost real time and are in no tutorial:
 *   - ChargeTotalAmount comes BEFORE AllowanceTotalAmount.
 *   - An empty ApplicableHeaderTradeDelivery must still be emitted.
 * Verified against the official Factur-X 1.09 EN16931 XSD.
 */
import { toMajor, roundHalfUp } from '@invoice-engine/core';
import type { Invoice, Party } from '@invoice-engine/core';
import { totals } from '@invoice-engine/core';

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
} as const;

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const el = (name: string, value?: unknown, attrs: Record<string, unknown> = {}): string => {
  const a = Object.entries(attrs).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  if (value == null || value === '') return `<${name}${a}/>`;
  return `<${name}${a}>${esc(value)}</${name}>`;
};
const wrap = (name: string, inner: string): string => (inner ? `<${name}>${inner}</${name}>` : '');
const date102 = (iso: string) => iso.replace(/-/g, '');

const party = (p: Party, role: string): string => wrap(role,
  (p.id ? el('ram:ID', p.id) : '') +
  el('ram:Name', p.name) +
  (p.legalId ? wrap('ram:SpecifiedLegalOrganization',
    el('ram:ID', p.legalId, { schemeID: p.legalIdScheme ?? '0002' })) : '') +
  wrap('ram:PostalTradeAddress',
    el('ram:PostcodeCode', p.postcode) +
    el('ram:LineOne', p.street) +
    el('ram:CityName', p.city) +
    el('ram:CountryID', p.country)) +
  // Sits after the address and before the tax registration. Strict sequence.
  (p.electronicAddress ? wrap('ram:URIUniversalCommunication',
    el('ram:URIID', p.electronicAddress, { schemeID: p.electronicAddressScheme ?? 'EM' })) : '') +
  (p.vatId ? wrap('ram:SpecifiedTaxRegistration', el('ram:ID', p.vatId, { schemeID: 'VA' })) : ''));

export function buildCII(invoice: Invoice, profile = 'urn:cen.eu:en16931:2017'): string {
  const t = totals(invoice);

  const lines = invoice.lines.map((l, i) => {
    const net = roundHalfUp(l.quantity * l.unitPriceMinor);
    return wrap('ram:IncludedSupplyChainTradeLineItem',
      wrap('ram:AssociatedDocumentLineDocument', el('ram:LineID', String(i + 1))) +
      wrap('ram:SpecifiedTradeProduct',
        (l.sellerAssignedId ? el('ram:SellerAssignedID', l.sellerAssignedId) : '') +
        el('ram:Name', l.name) +
        (l.description ? el('ram:Description', l.description) : '')) +
      wrap('ram:SpecifiedLineTradeAgreement',
        wrap('ram:NetPriceProductTradePrice', el('ram:ChargeAmount', toMajor(l.unitPriceMinor)))) +
      wrap('ram:SpecifiedLineTradeDelivery',
        el('ram:BilledQuantity', String(l.quantity), { unitCode: l.unitCode ?? 'C62' })) +
      wrap('ram:SpecifiedLineTradeSettlement',
        wrap('ram:ApplicableTradeTax',
          el('ram:TypeCode', 'VAT') +
          el('ram:CategoryCode', l.taxCategory) +
          el('ram:RateApplicablePercent', String(l.taxRate))) +
        wrap('ram:SpecifiedTradeSettlementLineMonetarySummation',
          el('ram:LineTotalAmount', toMajor(net)))));
  }).join('');

  const taxBreakdown = t.groups.map((g) => wrap('ram:ApplicableTradeTax',
    el('ram:CalculatedAmount', toMajor(g.amount)) +
    el('ram:TypeCode', 'VAT') +
    (g.exemptionReason ? el('ram:ExemptionReason', g.exemptionReason) : '') +
    el('ram:BasisAmount', toMajor(g.basis)) +
    el('ram:CategoryCode', g.category) +
    (g.exemptionCode ? el('ram:ExemptionReasonCode', g.exemptionCode) : '') +
    el('ram:RateApplicablePercent', String(g.rate)))).join('');

  const paymentMeans = wrap('ram:SpecifiedTradeSettlementPaymentMeans',
    el('ram:TypeCode', invoice.payment.meansCode) +
    (invoice.payment.iban
      ? wrap('ram:PayeePartyCreditorFinancialAccount', el('ram:IBANID', invoice.payment.iban))
      : ''));

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="${NS.rsm}" xmlns:qdt="${NS.qdt}" xmlns:ram="${NS.ram}" xmlns:udt="${NS.udt}">` +
      wrap('rsm:ExchangedDocumentContext',
        (invoice.businessProcess
          ? wrap('ram:BusinessProcessSpecifiedDocumentContextParameter', el('ram:ID', invoice.businessProcess))
          : '') +
        wrap('ram:GuidelineSpecifiedDocumentContextParameter', el('ram:ID', profile))) +
      wrap('rsm:ExchangedDocument',
        el('ram:ID', invoice.number) +
        el('ram:TypeCode', invoice.typeCode ?? '380') +
        wrap('ram:IssueDateTime', el('udt:DateTimeString', date102(invoice.issueDate), { format: '102' })) +
        (invoice.notes ?? []).map((n) => wrap('ram:IncludedNote',
          el('ram:Content', n.text) + (n.subjectCode ? el('ram:SubjectCode', n.subjectCode) : ''))).join('')) +
      wrap('rsm:SupplyChainTradeTransaction',
        lines +
        wrap('ram:ApplicableHeaderTradeAgreement',
          (invoice.buyerReference ? el('ram:BuyerReference', invoice.buyerReference) : '') +
          party(invoice.seller, 'ram:SellerTradeParty') +
          party(invoice.buyer, 'ram:BuyerTradeParty')) +
        '<ram:ApplicableHeaderTradeDelivery/>' +
        wrap('ram:ApplicableHeaderTradeSettlement',
          el('ram:InvoiceCurrencyCode', invoice.currency) +
          paymentMeans +
          taxBreakdown +
          (invoice.dueDate || invoice.paymentTerms
            ? wrap('ram:SpecifiedTradePaymentTerms',
                (invoice.paymentTerms ? el('ram:Description', invoice.paymentTerms) : '') +
                (invoice.dueDate ? wrap('ram:DueDateDateTime',
                  el('udt:DateTimeString', date102(invoice.dueDate), { format: '102' })) : ''))
            : '') +
          wrap('ram:SpecifiedTradeSettlementHeaderMonetarySummation',
            el('ram:LineTotalAmount', toMajor(t.lineTotal)) +
            el('ram:ChargeTotalAmount', toMajor(t.charge)) +
            el('ram:AllowanceTotalAmount', toMajor(t.allowance)) +
            el('ram:TaxBasisTotalAmount', toMajor(t.taxBasis)) +
            el('ram:TaxTotalAmount', toMajor(t.taxTotal), { currencyID: invoice.currency }) +
            el('ram:GrandTotalAmount', toMajor(t.grand)) +
            el('ram:TotalPrepaidAmount', toMajor(t.prepaid)) +
            el('ram:DuePayableAmount', toMajor(t.due))))) +
    `</rsm:CrossIndustryInvoice>`;
}
