/**
 * EN 16931 CII (UN/CEFACT Cross Industry Invoice) serializer.
 *
 * ELEMENT ORDER IS LOAD-BEARING. The XSD is xs:sequence throughout, so a
 * correctly-populated document in the wrong order is rejected. Two traps that
 * cost real time and are in no tutorial:
 *   - ChargeTotalAmount comes BEFORE AllowanceTotalAmount.
 *   - An empty ApplicableHeaderTradeDelivery must still be emitted.
 * Verified against the official UN/CEFACT D16B schema (and the Factur-X 1.09 EN16931 XSD).
 *
 * XRechnung is not a fork of this file. It is the `xrechnung` profile: same
 * bindings, different BT-24 and BT-23, plus terms the model already carries.
 *
 * Optional terms use tag()/wrap(), which emit nothing when the value is absent.
 * Mandatory terms use req(), which emits an empty element rather than skipping it,
 * so a missing mandatory value shows up as a validation error instead of a
 * silently different document. Input is checked first by checkInvoice(): a bad
 * model throws InvoiceInputError listing every problem, never a TypeError.
 */
import { totals, lineNet } from '@conformo/core';
import type { AllowanceCharge, Invoice, LineAllowanceCharge, Party, TaxCategory } from '@conformo/core';
import { assertInvoice, date102, dec, electronicAddressScheme, money, price, req, tag, wrap } from './xml.js';
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

/** BT-29/BT-46 style identifiers: without a scheme they are ram:ID, with one ram:GlobalID/@schemeID. */
const partyIds = (p: Party): string => {
  const all = [{ id: p.id, scheme: p.idScheme }, ...(p.additionalIds ?? [])].filter((x) => x.id);
  return all.filter((x) => !x.scheme).map((x) => tag('ram:ID', x.id)).join('') +
    all.filter((x) => x.scheme).map((x) => tag('ram:GlobalID', x.id, { schemeID: x.scheme })).join('');
};

// TradeParty is a strict sequence:
// ID, GlobalID, Name, Description, SpecifiedLegalOrganization, DefinedTradeContact,
// PostalTradeAddress, URIUniversalCommunication, SpecifiedTaxRegistration.
const party = (p: Party, role: string): string => wrap(role,
  partyIds(p) +
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

// Line level allowance/charge (BG-27/BG-28) has no tax category of its own.
const lineAllowanceCharge = (a: LineAllowanceCharge, isCharge: boolean): string =>
  wrap('ram:SpecifiedTradeAllowanceCharge',
    wrap('ram:ChargeIndicator', tag('udt:Indicator', isCharge ? 'true' : 'false')) +
    tag('ram:CalculationPercent', a.percent === undefined ? undefined : dec(a.percent)) +
    tag('ram:BasisAmount', a.baseAmountMinor === undefined ? undefined : money(a.baseAmountMinor)) +
    req('ram:ActualAmount', money(a.amountMinor)) +
    tag('ram:ReasonCode', a.reasonCode) +
    tag('ram:Reason', a.reason));

export function buildCII(invoice: Invoice, options: CIIOptions = {}): string {
  const profile = options.profile ?? 'en16931';
  assertInvoice(invoice);
  const t = totals(invoice);
  const process = businessProcess(profile, invoice.businessProcess);

  const lines = invoice.lines.map((l, i) => {
    const hasGross = l.grossPriceMinor !== undefined || l.priceDiscountMinor !== undefined;
    const base = l.priceBaseQuantity !== undefined
      ? tag('ram:BasisQuantity', dec(l.priceBaseQuantity), { unitCode: l.priceBaseUnitCode ?? l.unitCode ?? 'C62' }) : '';
    const grossPrice = hasGross ? wrap('ram:GrossPriceProductTradePrice',
      req('ram:ChargeAmount', price(l.grossPriceMinor ?? (l.unitPriceMinor + (l.priceDiscountMinor ?? 0)))) +   // BT-148
      base +
      (l.priceDiscountMinor !== undefined ? wrap('ram:AppliedTradeAllowanceCharge',                          // BT-147
        wrap('ram:ChargeIndicator', tag('udt:Indicator', 'false')) +
        req('ram:ActualAmount', price(l.priceDiscountMinor))) : '')) : '';
    return wrap('ram:IncludedSupplyChainTradeLineItem',
      wrap('ram:AssociatedDocumentLineDocument',
        req('ram:LineID', l.id ?? String(i + 1)) +                                       // BT-126
        wrap('ram:IncludedNote', tag('ram:Content', l.note))) +                          // BT-127
      wrap('ram:SpecifiedTradeProduct',
        tag('ram:GlobalID', l.standardItemId, { schemeID: l.standardItemIdScheme }) +   // BT-157
        tag('ram:SellerAssignedID', l.sellerAssignedId) +
        tag('ram:BuyerAssignedID', l.buyerAssignedId) +                                 // BT-156
        req('ram:Name', l.name) +
        tag('ram:Description', l.description) +
        (l.attributes ?? []).map((a) => wrap('ram:ApplicableProductCharacteristic',     // BG-32
          tag('ram:Description', a.name) + tag('ram:Value', a.value))).join('') +
        (l.classifications ?? []).map((c) => wrap('ram:DesignatedProductClassification', // BT-158
          tag('ram:ClassCode', c.code, { listID: c.scheme, listVersionID: c.schemeVersion }))).join('') +
        wrap('ram:OriginTradeCountry', tag('ram:ID', l.originCountry))) +               // BT-159
      wrap('ram:SpecifiedLineTradeAgreement',
        wrap('ram:BuyerOrderReferencedDocument', tag('ram:LineID', l.orderLineReference)) + // BT-132
        grossPrice +
        wrap('ram:NetPriceProductTradePrice', req('ram:ChargeAmount', price(l.unitPriceMinor)) + base)) +
      wrap('ram:SpecifiedLineTradeDelivery',
        req('ram:BilledQuantity', dec(l.quantity), { unitCode: l.unitCode ?? 'C62' })) +
      wrap('ram:SpecifiedLineTradeSettlement',
        wrap('ram:ApplicableTradeTax',
          req('ram:TypeCode', 'VAT') +
          req('ram:CategoryCode', l.taxCategory) +
          rate(l.taxCategory, l.taxRate)) +
        (l.periodStart || l.periodEnd ? wrap('ram:BillingSpecifiedPeriod',               // BG-26
          (l.periodStart ? date('ram:StartDateTime', l.periodStart) : '') +
          (l.periodEnd ? date('ram:EndDateTime', l.periodEnd) : '')) : '') +
        (l.allowances ?? []).map((a) => lineAllowanceCharge(a, false)).join('') +
        (l.charges ?? []).map((c) => lineAllowanceCharge(c, true)).join('') +
        wrap('ram:SpecifiedTradeSettlementLineMonetarySummation',
          req('ram:LineTotalAmount', money(lineNet(l)))) +
        (l.objectId ? wrap('ram:AdditionalReferencedDocument',                           // BT-128
          req('ram:IssuerAssignedID', l.objectId) + req('ram:TypeCode', '130') +
          tag('ram:ReferenceTypeCode', l.objectIdScheme)) : '') +
        wrap('ram:ReceivableSpecifiedTradeAccountingAccount', tag('ram:ID', l.buyerAccountingReference)))); // BT-133
  }).join('');

  // ApplicableTradeTax is a strict sequence:
  // CalculatedAmount, TypeCode, ExemptionReason, BasisAmount, CategoryCode,
  // ExemptionReasonCode, TaxPointDate, DueDateTypeCode, RateApplicablePercent.
  const taxBreakdown = t.groups.map((g) => wrap('ram:ApplicableTradeTax',
    req('ram:CalculatedAmount', money(g.amount)) +
    req('ram:TypeCode', 'VAT') +
    tag('ram:ExemptionReason', g.exemptionReason) +
    req('ram:BasisAmount', money(g.basis)) +
    req('ram:CategoryCode', g.category) +
    tag('ram:ExemptionReasonCode', g.exemptionCode) +
    (invoice.taxPointDate ? wrap('ram:TaxPointDate', tag('udt:DateString', date102(invoice.taxPointDate), { format: '102' })) : '') + // BT-7
    tag('ram:DueDateTypeCode', invoice.taxPointDateCode) +                                                                           // BT-8
    rate(g.category, g.rate))).join('');

  const p = invoice.payment;
  const dd = p?.directDebit;
  const account = (p0: NonNullable<typeof p>, iban?: string, name?: string, bic?: string, withMeans = true) =>
    wrap('ram:SpecifiedTradeSettlementPaymentMeans',
      req('ram:TypeCode', p0.meansCode) +
      (withMeans ? tag('ram:Information', p0.meansText) : '') +                                      // BT-82
      (withMeans && p0.card ? wrap('ram:ApplicableTradeSettlementFinancialCard',                      // BG-18
        tag('ram:ID', p0.card.pan) + tag('ram:CardholderName', p0.card.holderName)) : '') +
      (withMeans ? wrap('ram:PayerPartyDebtorFinancialAccount', tag('ram:IBANID', dd?.debitedAccountIban)) : '') + // BT-91
      wrap('ram:PayeePartyCreditorFinancialAccount',
        tag('ram:IBANID', iban) + tag('ram:AccountName', name)) +                                    // BT-84, BT-85
      wrap('ram:PayeeSpecifiedCreditorFinancialInstitution', tag('ram:BICID', bic)));              // BT-86
  const paymentMeans = p
    ? account(p, p.iban, p.accountName, p.bic) +
      (p.additionalAccounts ?? []).map((a) => account(p, a.iban, a.accountName, a.bic, false)).join('')
    : '';

  const tr = invoice.taxRepresentative;
  const additionalDocs = (invoice.attachments ?? []).map((a) => wrap('ram:AdditionalReferencedDocument', // BG-24
    req('ram:IssuerAssignedID', a.id) +
    tag('ram:URIID', a.url) +
    req('ram:TypeCode', '916') +
    tag('ram:Name', a.description) +
    tag('ram:AttachmentBinaryObject', a.content, { mimeCode: a.mimeCode, filename: a.filename }))).join('') +
    (invoice.tenderOrLotReference ? wrap('ram:AdditionalReferencedDocument',                        // BT-17
      req('ram:IssuerAssignedID', invoice.tenderOrLotReference) + req('ram:TypeCode', '50')) : '') +
    (invoice.invoicedObjectId ? wrap('ram:AdditionalReferencedDocument',                            // BT-18
      req('ram:IssuerAssignedID', invoice.invoicedObjectId) + req('ram:TypeCode', '130') +
      tag('ram:ReferenceTypeCode', invoice.invoicedObjectIdScheme)) : '');
  const agreement = wrap('ram:ApplicableHeaderTradeAgreement',
    tag('ram:BuyerReference', invoice.buyerReference) +
    party(invoice.seller, 'ram:SellerTradeParty') +
    party(invoice.buyer, 'ram:BuyerTradeParty') +
    (tr ? wrap('ram:SellerTaxRepresentativeTradeParty',                               // BG-11
      req('ram:Name', tr.name) + address(tr) +
      wrap('ram:SpecifiedTaxRegistration', tag('ram:ID', tr.vatId, { schemeID: 'VA' }))) : '') +
    wrap('ram:SellerOrderReferencedDocument', tag('ram:IssuerAssignedID', invoice.salesOrderReference)) + // BT-14
    wrap('ram:BuyerOrderReferencedDocument', tag('ram:IssuerAssignedID', invoice.orderReference)) +
    wrap('ram:ContractReferencedDocument', tag('ram:IssuerAssignedID', invoice.contractReference)) +
    additionalDocs +
    wrap('ram:SpecifiedProcuringProject', tag('ram:ID', invoice.projectReference) + (invoice.projectReference ? '<ram:Name>Project</ram:Name>' : ''))); // BT-11

  // Must be emitted even when empty: the XSD requires the element.
  const d = invoice.delivery;
  const deliveryInner =
    (d ? wrap('ram:ShipToTradeParty',
      tag('ram:ID', d.locationId, { schemeID: d.locationIdScheme }) +                      // BT-71
      tag('ram:Name', d.partyName) + address(d)) +
      wrap('ram:ActualDeliverySupplyChainEvent', d.date ? date('ram:OccurrenceDateTime', d.date) : '') : '') +
    wrap('ram:DespatchAdviceReferencedDocument', tag('ram:IssuerAssignedID', invoice.despatchAdviceReference)) +   // BT-16
    wrap('ram:ReceivingAdviceReferencedDocument', tag('ram:IssuerAssignedID', invoice.receivingAdviceReference));  // BT-15
  const delivery = deliveryInner ? `<ram:ApplicableHeaderTradeDelivery>${deliveryInner}</ram:ApplicableHeaderTradeDelivery>`
    : '<ram:ApplicableHeaderTradeDelivery/>';

  const period = invoice.periodStart || invoice.periodEnd
    ? wrap('ram:BillingSpecifiedPeriod',
        (invoice.periodStart ? date('ram:StartDateTime', invoice.periodStart) : '') +
        (invoice.periodEnd ? date('ram:EndDateTime', invoice.periodEnd) : ''))
    : '';

  const hasTaxCurrency = !!invoice.taxCurrency && invoice.taxCurrency !== invoice.currency;
  const payee = invoice.payee;

  const settlement = wrap('ram:ApplicableHeaderTradeSettlement',
    tag('ram:CreditorReferenceID', dd?.creditorId) +                                  // BT-90
    tag('ram:PaymentReference', p?.reference) +                                        // BT-83
    tag('ram:TaxCurrencyCode', hasTaxCurrency ? invoice.taxCurrency : undefined) +    // BT-6
    req('ram:InvoiceCurrencyCode', invoice.currency) +
    (payee ? wrap('ram:PayeeTradeParty',                                              // BG-10
      tag('ram:ID', payee.idScheme ? undefined : payee.id) +
      tag('ram:GlobalID', payee.idScheme ? payee.id : undefined, { schemeID: payee.idScheme }) +
      req('ram:Name', payee.name) +
      wrap('ram:SpecifiedLegalOrganization', tag('ram:ID', payee.legalId, { schemeID: payee.legalIdScheme }))) : '') +
    paymentMeans +
    taxBreakdown +
    period +
    (invoice.allowances ?? []).map((a) => allowanceCharge(a, false)).join('') +       // BG-20
    (invoice.charges ?? []).map((c) => allowanceCharge(c, true)).join('') +           // BG-21
    (invoice.dueDate || invoice.paymentTerms || dd?.mandateId
      ? wrap('ram:SpecifiedTradePaymentTerms',
          tag('ram:Description', invoice.paymentTerms) +
          (invoice.dueDate ? date('ram:DueDateDateTime', invoice.dueDate) : '') +
          tag('ram:DirectDebitMandateID', dd?.mandateId))                              // BT-89
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
        tag('qdt:DateTimeString', date102(r.issueDate), { format: '102' })) : ''))).join('') +
    wrap('ram:ReceivableSpecifiedTradeAccountingAccount', tag('ram:ID', invoice.buyerAccountingReference))); // BT-19

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
