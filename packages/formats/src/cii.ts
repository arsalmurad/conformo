/**
 * EN 16931 CII (UN/CEFACT Cross Industry Invoice) serializer.
 *
 * ELEMENT ORDER IS LOAD-BEARING. The XSD is xs:sequence throughout, so a
 * correctly-populated document in the wrong order is rejected. Two traps that
 * cost real time and are in no tutorial:
 *   - ChargeTotalAmount comes BEFORE AllowanceTotalAmount.
 *   - An empty ApplicableHeaderTradeDelivery must still be emitted.
 * Verified against the official Factur-X 1.09 EN16931 XSD.
 *
 * XRechnung is not a fork of this file. It is the `xrechnung` profile: same
 * bindings, different BT-24 and BT-23, plus terms the model already carries.
 *
 * Optional terms use tag()/wrap(), which emit nothing when the value is absent.
 * Mandatory terms use req(), which emits an empty element rather than skipping it,
 * so a missing mandatory value shows up as a validation error instead of a
 * silently different document.
 */
import { totals, lineNet } from '@conformo/core';
import type { AllowanceCharge, Invoice, Party, TaxCategory } from '@conformo/core';
import { assertSerializable, date102, dec, electronicAddressScheme, money, req, tag, wrap } from './xml.js';
import { CUSTOMIZATION_ID, businessProcess } from './profiles.js';
import type { Profile } from './profiles.js';

/** Exported so packages/parse's CII reader resolves elements against the
 * exact same URIs this writer emits — one source of truth, not two string
 * literals that could silently drift apart. */
export const CII_NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
} as const;
const NS = CII_NS;

export interface CIIOptions {
  /** BT-24 / BT-23 profile. Peppol BIS Billing 3.0 is UBL only. */
  profile?: Extract<Profile, 'en16931' | 'xrechnung'>;
}

interface AddressParts {
  street?: string; street2?: string; street3?: string;
  city?: string; postcode?: string; subdivision?: string; country?: string;
}

// PostalTradeAddress children are an xs:sequence: postcode, lines, city, country, subdivision.
const address = (a: AddressParts): string => wrap('ram:PostalTradeAddress',
  tag('ram:PostcodeCode', a.postcode) +
  tag('ram:LineOne', a.street) +
  tag('ram:LineTwo', a.street2) +
  tag('ram:LineThree', a.street3) +
  tag('ram:CityName', a.city) +
  req('ram:CountryID', a.country) +
  tag('ram:CountrySubDivisionName', a.subdivision));

// A rate is never written for category O (BR-O-05); 0 is written for E, Z, AE, K, G.
const rate = (category: TaxCategory, r: number): string =>
  category === 'O' ? '' : tag('ram:RateApplicablePercent', dec(r));

const date = (name: string, iso: string): string =>
  wrap(name, tag('udt:DateTimeString', date102(iso), { format: '102' }));

// TradeParty is a strict sequence:
// ID, Name, Description, SpecifiedLegalOrganization, DefinedTradeContact,
// PostalTradeAddress, URIUniversalCommunication, SpecifiedTaxRegistration.
const party = (p: Party, role: string): string => wrap(role,
  tag('ram:ID', p.id, { schemeID: p.idScheme }) +
  req('ram:Name', p.name) +
  tag('ram:Description', p.additionalLegalInfo) +                                   // BT-33
  wrap('ram:SpecifiedLegalOrganization',
    tag('ram:ID', p.legalId, { schemeID: p.legalIdScheme }) +
    tag('ram:TradingBusinessName', p.tradingName)) +                                // BT-28 / BT-45
  wrap('ram:DefinedTradeContact',                                                   // BG-6 / BG-9
    tag('ram:PersonName', p.contact?.name) +
    wrap('ram:TelephoneUniversalCommunication', tag('ram:CompleteNumber', p.contact?.phone)) +
    wrap('ram:EmailURIUniversalCommunication', tag('ram:URIID', p.contact?.email))) +
  address(p) +
  // Sits after the address and before the tax registration. Strict sequence.
  wrap('ram:URIUniversalCommunication',
    tag('ram:URIID', p.electronicAddress, { schemeID: electronicAddressScheme(p) })) +
  wrap('ram:SpecifiedTaxRegistration', tag('ram:ID', p.vatId, { schemeID: 'VA' })) +   // BT-31
  wrap('ram:SpecifiedTaxRegistration', tag('ram:ID', p.taxRegistrationId, { schemeID: 'FC' }))); // BT-32

const allowanceCharge = (a: AllowanceCharge, isCharge: boolean): string =>
  wrap('ram:SpecifiedTradeAllowanceCharge',
    wrap('ram:ChargeIndicator', tag('udt:Indicator', isCharge ? 'true' : 'false')) +
    tag('ram:CalculationPercent', a.percent === undefined ? undefined : dec(a.percent)) +
    tag('ram:BasisAmount', a.baseAmountMinor === undefined ? undefined : money(a.baseAmountMinor)) +
    req('ram:ActualAmount', money(a.amountMinor)) +
    tag('ram:ReasonCode', a.reasonCode) +
    tag('ram:Reason', a.reason) +
    wrap('ram:CategoryTradeTax',
      req('ram:TypeCode', 'VAT') + req('ram:CategoryCode', a.taxCategory) + rate(a.taxCategory, a.taxRate)));

export function buildCII(invoice: Invoice, options: CIIOptions = {}): string {
  const profile = options.profile ?? 'en16931';
  assertSerializable(invoice);
  const t = totals(invoice);
  const process = businessProcess(profile, invoice.businessProcess);

  const lines = invoice.lines.map((l, i) => wrap('ram:IncludedSupplyChainTradeLineItem',
    wrap('ram:AssociatedDocumentLineDocument', req('ram:LineID', String(i + 1))) +
    wrap('ram:SpecifiedTradeProduct',
      tag('ram:GlobalID', l.standardItemId, { schemeID: l.standardItemIdScheme }) +   // BT-157
      tag('ram:SellerAssignedID', l.sellerAssignedId) +
      tag('ram:BuyerAssignedID', l.buyerAssignedId) +                                 // BT-156
      req('ram:Name', l.name) +
      tag('ram:Description', l.description) +
      wrap('ram:OriginTradeCountry', tag('ram:ID', l.originCountry))) +               // BT-159
    wrap('ram:SpecifiedLineTradeAgreement',
      wrap('ram:NetPriceProductTradePrice', req('ram:ChargeAmount', money(l.unitPriceMinor)))) +
    wrap('ram:SpecifiedLineTradeDelivery',
      req('ram:BilledQuantity', dec(l.quantity), { unitCode: l.unitCode ?? 'C62' })) +
    wrap('ram:SpecifiedLineTradeSettlement',
      wrap('ram:ApplicableTradeTax',
        req('ram:TypeCode', 'VAT') +
        req('ram:CategoryCode', l.taxCategory) +
        rate(l.taxCategory, l.taxRate)) +
      wrap('ram:SpecifiedTradeSettlementLineMonetarySummation',
        req('ram:LineTotalAmount', money(lineNet(l))))))).join('');

  // ApplicableTradeTax is a strict sequence:
  // CalculatedAmount, TypeCode, ExemptionReason, BasisAmount, CategoryCode,
  // ExemptionReasonCode, RateApplicablePercent.
  const taxBreakdown = t.groups.map((g) => wrap('ram:ApplicableTradeTax',
    req('ram:CalculatedAmount', money(g.amount)) +
    req('ram:TypeCode', 'VAT') +
    tag('ram:ExemptionReason', g.exemptionReason) +
    req('ram:BasisAmount', money(g.basis)) +
    req('ram:CategoryCode', g.category) +
    tag('ram:ExemptionReasonCode', g.exemptionCode) +
    rate(g.category, g.rate))).join('');

  const p = invoice.payment;
  const paymentMeans = wrap('ram:SpecifiedTradeSettlementPaymentMeans',
    req('ram:TypeCode', p.meansCode) +
    tag('ram:Information', p.meansText) +                                             // BT-82
    wrap('ram:PayeePartyCreditorFinancialAccount',
      tag('ram:IBANID', p.iban) + tag('ram:AccountName', p.accountName)) +            // BT-84, BT-85
    wrap('ram:PayeeSpecifiedCreditorFinancialInstitution', tag('ram:BICID', p.bic))); // BT-86

  const tr = invoice.taxRepresentative;
  const agreement = wrap('ram:ApplicableHeaderTradeAgreement',
    tag('ram:BuyerReference', invoice.buyerReference) +
    party(invoice.seller, 'ram:SellerTradeParty') +
    party(invoice.buyer, 'ram:BuyerTradeParty') +
    (tr ? wrap('ram:SellerTaxRepresentativeTradeParty',                               // BG-11
      req('ram:Name', tr.name) + address(tr) +
      wrap('ram:SpecifiedTaxRegistration', tag('ram:ID', tr.vatId, { schemeID: 'VA' }))) : '') +
    wrap('ram:BuyerOrderReferencedDocument', tag('ram:IssuerAssignedID', invoice.orderReference)) +
    wrap('ram:ContractReferencedDocument', tag('ram:IssuerAssignedID', invoice.contractReference)));

  // Must be emitted even when empty: the XSD requires the element.
  const d = invoice.delivery;
  const deliveryInner = d
    ? wrap('ram:ShipToTradeParty', tag('ram:Name', d.partyName) + address(d)) +
      wrap('ram:ActualDeliverySupplyChainEvent', d.date ? date('ram:OccurrenceDateTime', d.date) : '')
    : '';
  const delivery = deliveryInner ? `<ram:ApplicableHeaderTradeDelivery>${deliveryInner}</ram:ApplicableHeaderTradeDelivery>`
    : '<ram:ApplicableHeaderTradeDelivery/>';

  const period = invoice.periodStart || invoice.periodEnd
    ? wrap('ram:BillingSpecifiedPeriod',
        (invoice.periodStart ? date('ram:StartDateTime', invoice.periodStart) : '') +
        (invoice.periodEnd ? date('ram:EndDateTime', invoice.periodEnd) : ''))
    : '';

  const hasTaxCurrency = !!invoice.taxCurrency && invoice.taxCurrency !== invoice.currency;

  const settlement = wrap('ram:ApplicableHeaderTradeSettlement',
    tag('ram:PaymentReference', p.reference) +                                        // BT-83
    tag('ram:TaxCurrencyCode', hasTaxCurrency ? invoice.taxCurrency : undefined) +    // BT-6
    req('ram:InvoiceCurrencyCode', invoice.currency) +
    paymentMeans +
    taxBreakdown +
    period +
    (invoice.allowances ?? []).map((a) => allowanceCharge(a, false)).join('') +       // BG-20
    (invoice.charges ?? []).map((c) => allowanceCharge(c, true)).join('') +           // BG-21
    (invoice.dueDate || invoice.paymentTerms
      ? wrap('ram:SpecifiedTradePaymentTerms',
          tag('ram:Description', invoice.paymentTerms) +
          (invoice.dueDate ? date('ram:DueDateDateTime', invoice.dueDate) : ''))
      : '') +
    wrap('ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      req('ram:LineTotalAmount', money(t.lineTotal)) +
      req('ram:ChargeTotalAmount', money(t.charge)) +
      req('ram:AllowanceTotalAmount', money(t.allowance)) +
      req('ram:TaxBasisTotalAmount', money(t.taxBasis)) +
      req('ram:TaxTotalAmount', money(t.taxTotal), { currencyID: invoice.currency }) +
      (hasTaxCurrency
        ? req('ram:TaxTotalAmount', money(invoice.taxTotalInTaxCurrencyMinor ?? 0), { currencyID: invoice.taxCurrency }) : '') +
      (invoice.roundingMinor === undefined ? '' : req('ram:RoundingAmount', money(invoice.roundingMinor))) +
      req('ram:GrandTotalAmount', money(t.grand)) +
      req('ram:TotalPrepaidAmount', money(t.prepaid)) +
      req('ram:DuePayableAmount', money(t.due))) +
    (invoice.precedingInvoices ?? []).map((r) => wrap('ram:InvoiceReferencedDocument',   // BG-3
      req('ram:IssuerAssignedID', r.number) +
      (r.issueDate ? wrap('ram:FormattedIssueDateTime',
        tag('qdt:DateTimeString', date102(r.issueDate), { format: '102' })) : ''))).join(''));

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="${NS.rsm}" xmlns:qdt="${NS.qdt}" xmlns:ram="${NS.ram}" xmlns:udt="${NS.udt}">` +
      wrap('rsm:ExchangedDocumentContext',
        wrap('ram:BusinessProcessSpecifiedDocumentContextParameter', tag('ram:ID', process)) +
        wrap('ram:GuidelineSpecifiedDocumentContextParameter', req('ram:ID', CUSTOMIZATION_ID[profile]))) +
      wrap('rsm:ExchangedDocument',
        req('ram:ID', invoice.number) +
        req('ram:TypeCode', invoice.typeCode ?? '380') +
        wrap('ram:IssueDateTime', req('udt:DateTimeString', date102(invoice.issueDate), { format: '102' })) +
        (invoice.notes ?? []).map((n) => wrap('ram:IncludedNote',
          req('ram:Content', n.text) + tag('ram:SubjectCode', n.subjectCode))).join('')) +
      wrap('rsm:SupplyChainTradeTransaction', lines + agreement + delivery + settlement) +
    `</rsm:CrossIndustryInvoice>`;
}
