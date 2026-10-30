/**
 * UBL 2.1 serializer: Invoice and CreditNote, EN 16931 syntax binding.
 *
 * ONE serializer, three profiles (en16931, peppol, xrechnung). Peppol BIS Billing
 * 3.0 and XRechnung 3.0 are CIUS of the same binding: they change BT-24 and BT-23
 * and make more terms mandatory, and the Schematron for each says which. They do not
 * change where a term lives, so they are options here, not forks.
 *
 * ELEMENT ORDER IS LOAD-BEARING, exactly as in cii.ts: UBL is xs:sequence throughout.
 * Where UBL 2.1 differs between the two document types it is handled below:
 *   - A CreditNote has no document-level DueDate. BT-9 goes in PaymentMeans/PaymentDueDate.
 *   - Lines are CreditNoteLine / CreditedQuantity, not InvoiceLine / InvoicedQuantity.
 *   - Type 381 must be a CreditNote root: Peppol rejects a 381 inside an Invoice.
 *
 * BT-21 (note subject code) has no element of its own in UBL. The binding prefixes
 * it to the note text as "#AAB#text", which is also what the French rules expect.
 */
import { CREDIT_NOTE_TYPE_CODES, totals, lineNet } from '@conformo/core';
import type { AllowanceCharge, Invoice, LineAllowanceCharge, Party, TaxCategory } from '@conformo/core';
import { assertInvoice, dec, electronicAddressScheme, money, price, req, tag, wrap } from './xml.js';
import { CUSTOMIZATION_ID, businessProcess } from './profiles.js';
import type { Profile } from './profiles.js';

/** Exported so packages/parse's UBL reader resolves elements against the
 * exact same URIs this writer emits — one source of truth, not two string
 * literals that could silently drift apart. */
export const UBL_NS = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  creditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
} as const;
const NS = UBL_NS;

export interface UBLOptions {
  profile?: Exclude<Profile, 'extended'>;
  /** Writes this exact BT-24 instead of the profile's (see CIIOptions.customizationId). */
  customizationId?: string;
}

interface AddressParts {
  street?: string; street2?: string; street3?: string;
  city?: string; postcode?: string; subdivision?: string; country?: string;
}

// The address field sequence is shared by two different wrapper elements: a Party's
// address is cac:PostalAddress (AddressType), but cac:DeliveryLocation is a
// LocationType, whose address child is cac:Address, not cac:PostalAddress. Same
// fields, different element name; get the wrapper wrong and the XSD rejects the
// document with a confusing "PostalAddress not expected" error that looks like a
// content-order bug rather than a wrong element name.
const addressFields = (a: AddressParts): string =>
  tag('cbc:StreetName', a.street) +
  tag('cbc:AdditionalStreetName', a.street2) +
  tag('cbc:CityName', a.city) +
  tag('cbc:PostalZone', a.postcode) +
  tag('cbc:CountrySubentity', a.subdivision) +
  wrap('cac:AddressLine', tag('cbc:Line', a.street3)) +
  wrap('cac:Country', req('cbc:IdentificationCode', a.country));

const postal = (a: AddressParts): string => wrap('cac:PostalAddress', addressFields(a));
const locationAddress = (a: AddressParts): string => wrap('cac:Address', addressFields(a));

const scheme = (id: string): string => wrap('cac:TaxScheme', req('cbc:ID', id));

// A rate is never written for category O (BR-O-05); 0 is written for E, Z, AE, K, G.
const percent = (category: TaxCategory, r: number, forceZeroForO = false): string =>
  category === 'O' && !forceZeroForO ? '' : tag('cbc:Percent', dec(category === 'O' ? 0 : r));

const taxCategory = (name: string, category: TaxCategory, r: number, code?: string, reason?: string, forceZeroForO = false): string =>
  wrap(name,
    req('cbc:ID', category) +
    percent(category, r, forceZeroForO) +
    tag('cbc:TaxExemptionReasonCode', code) +
    tag('cbc:TaxExemptionReason', reason) +
    scheme('VAT'));

// Party is a strict sequence: EndpointID, PartyIdentification, PartyName, PostalAddress,
// PartyTaxScheme, PartyLegalEntity, Contact.
const partyIds = (p: Party, sepaCreditorId?: string): string =>
  [{ id: p.id, scheme: p.idScheme }, ...(p.additionalIds ?? []), { id: sepaCreditorId, scheme: 'SEPA' }]
    .filter((x) => x.id)
    .map((x) => wrap('cac:PartyIdentification', tag('cbc:ID', x.id, { schemeID: x.scheme }))).join('');

const party = (p: Party, sepaCreditorId?: string): string => wrap('cac:Party',
  tag('cbc:EndpointID', p.electronicAddress, { schemeID: electronicAddressScheme(p) }) +   // BT-34 / BT-49
  partyIds(p, sepaCreditorId) +                                                             // BT-29 / BT-46 (+ BT-90)
  wrap('cac:PartyName', tag('cbc:Name', p.tradingName)) +                                   // BT-28 / BT-45
  postal(p) +
  wrap('cac:PartyTaxScheme', p.vatId ? req('cbc:CompanyID', p.vatId) + scheme('VAT') : '') + // BT-31
  wrap('cac:PartyTaxScheme', p.taxRegistrationId ? req('cbc:CompanyID', p.taxRegistrationId) + scheme('FC') : '') + // BT-32
  wrap('cac:PartyLegalEntity',
    req('cbc:RegistrationName', p.name) +                                                   // BT-27 / BT-44
    tag('cbc:CompanyID', p.legalId, { schemeID: p.legalIdScheme }) +                        // BT-30 / BT-47
    tag('cbc:CompanyLegalForm', p.additionalLegalInfo)) +                                   // BT-33
  wrap('cac:Contact',                                                                       // BG-6 / BG-9
    tag('cbc:Name', p.contact?.name) +
    tag('cbc:Telephone', p.contact?.phone) +
    tag('cbc:ElectronicMail', p.contact?.email)));

export function buildUBL(invoice: Invoice, options: UBLOptions = {}): string {
  const profile = options.profile ?? 'en16931';
  assertInvoice(invoice);
  const t = totals(invoice);
  const cur = invoice.currency;
  const credit = CREDIT_NOTE_TYPE_CODES.includes(invoice.typeCode ?? '380');
  const root = credit ? 'CreditNote' : 'Invoice';
  const amount = (name: string, minor: number, currency = cur): string =>
    req(`cbc:${name}`, money(minor), { currencyID: currency });
  const priceAmount = (name: string, minor: number): string => req(`cbc:${name}`, price(minor), { currencyID: cur });
  const hasTaxCurrency = !!invoice.taxCurrency && invoice.taxCurrency !== cur;

  const allowanceCharge = (a: AllowanceCharge, isCharge: boolean): string => wrap('cac:AllowanceCharge',
    req('cbc:ChargeIndicator', isCharge ? 'true' : 'false') +
    tag('cbc:AllowanceChargeReasonCode', a.reasonCode) +
    tag('cbc:AllowanceChargeReason', a.reason) +
    tag('cbc:MultiplierFactorNumeric', a.percent === undefined ? undefined : dec(a.percent)) +
    amount('Amount', a.amountMinor) +
    (a.baseAmountMinor === undefined ? '' : amount('BaseAmount', a.baseAmountMinor)) +
    taxCategory('cac:TaxCategory', a.taxCategory, a.taxRate));

  const lineAC = (a: LineAllowanceCharge, isCharge: boolean): string => wrap('cac:AllowanceCharge',
    req('cbc:ChargeIndicator', isCharge ? 'true' : 'false') +
    tag('cbc:AllowanceChargeReasonCode', a.reasonCode) +
    tag('cbc:AllowanceChargeReason', a.reason) +
    tag('cbc:MultiplierFactorNumeric', a.percent === undefined ? undefined : dec(a.percent)) +
    amount('Amount', a.amountMinor) +
    (a.baseAmountMinor === undefined ? '' : amount('BaseAmount', a.baseAmountMinor)));

  const lines = invoice.lines.map((l, i) => {
    const hasGross = l.grossPriceMinor !== undefined || l.priceDiscountMinor !== undefined;
    const unit = l.unitCode ?? 'C62';
    return wrap(credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
      req('cbc:ID', l.id ?? String(i + 1)) +
      tag('cbc:Note', l.note) +                                                              // BT-127
      req(credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', dec(l.quantity), { unitCode: unit }) +
      amount('LineExtensionAmount', lineNet(l)) +
      tag('cbc:AccountingCost', l.buyerAccountingReference) +                                // BT-133
      (l.periodStart || l.periodEnd ? wrap('cac:InvoicePeriod',                              // BG-26
        tag('cbc:StartDate', l.periodStart) + tag('cbc:EndDate', l.periodEnd)) : '') +
      wrap('cac:OrderLineReference', tag('cbc:LineID', l.orderLineReference)) +              // BT-132
      (l.objectId ? wrap('cac:DocumentReference',                                            // BT-128
        req('cbc:ID', l.objectId, { schemeID: l.objectIdScheme }) + req('cbc:DocumentTypeCode', '130')) : '') +
      (l.allowances ?? []).map((a) => lineAC(a, false)).join('') +
      (l.charges ?? []).map((c) => lineAC(c, true)).join('') +
      wrap('cac:Item',
        tag('cbc:Description', l.description) +
        req('cbc:Name', l.name) +
        wrap('cac:BuyersItemIdentification', tag('cbc:ID', l.buyerAssignedId)) +              // BT-156
        wrap('cac:SellersItemIdentification', tag('cbc:ID', l.sellerAssignedId)) +            // BT-155
        wrap('cac:StandardItemIdentification',                                                // BT-157
          tag('cbc:ID', l.standardItemId, { schemeID: l.standardItemIdScheme })) +
        wrap('cac:OriginCountry', tag('cbc:IdentificationCode', l.originCountry)) +           // BT-159
        (l.classifications ?? []).map((c) => wrap('cac:CommodityClassification',              // BT-158
          tag('cbc:ItemClassificationCode', c.code, { listID: c.scheme, listVersionID: c.schemeVersion }))).join('') +
        taxCategory('cac:ClassifiedTaxCategory', l.taxCategory, l.taxRate) +
        (l.attributes ?? []).map((a) => wrap('cac:AdditionalItemProperty',                    // BG-32
          req('cbc:Name', a.name) + req('cbc:Value', a.value))).join('')) +
      wrap('cac:Price',
        priceAmount('PriceAmount', l.unitPriceMinor) +
        (l.priceBaseQuantity !== undefined
          ? tag('cbc:BaseQuantity', dec(l.priceBaseQuantity), { unitCode: l.priceBaseUnitCode ?? unit }) : '') +
        (hasGross ? wrap('cac:AllowanceCharge',                                               // BT-147 / BT-148
          req('cbc:ChargeIndicator', 'false') +
          priceAmount('Amount', l.priceDiscountMinor ?? 0) +
          (l.grossPriceMinor !== undefined ? priceAmount('BaseAmount', l.grossPriceMinor) : '')) : '')));
  }).join('');

  const notes = (invoice.notes ?? []).map((n) =>
    tag('cbc:Note', n.subjectCode ? `#${n.subjectCode}#${n.text}` : n.text)).join('');

  const p = invoice.payment;
  const dd = p?.directDebit;
  const account = (iban: string | undefined, name?: string, bic?: string) => wrap('cac:PayeeFinancialAccount',
    tag('cbc:ID', iban) +                                                                   // BT-84
    tag('cbc:Name', name) +                                                                 // BT-85
    wrap('cac:FinancialInstitutionBranch', tag('cbc:ID', bic)));                            // BT-86
  const paymentMeans = !p ? '' : wrap('cac:PaymentMeans',
    req('cbc:PaymentMeansCode', p.meansCode, { name: p.meansText }) +                       // BT-81, BT-82
    (credit ? tag('cbc:PaymentDueDate', invoice.dueDate) : '') +                            // BT-9, CreditNote only
    tag('cbc:PaymentID', p.reference) +                                                     // BT-83
    (p.card ? wrap('cac:CardAccount',                                                       // BG-18
      req('cbc:PrimaryAccountNumberID', p.card.pan) + req('cbc:NetworkID', 'mock') + tag('cbc:HolderName', p.card.holderName)) : '') +
    account(p.iban, p.accountName, p.bic) +
    (dd?.mandateId || dd?.debitedAccountIban ? wrap('cac:PaymentMandate',                   // BG-19
      tag('cbc:ID', dd.mandateId) +                                                         // BT-89
      wrap('cac:PayerFinancialAccount', tag('cbc:ID', dd.debitedAccountIban))) : '')) +     // BT-91
    (p.additionalAccounts ?? []).map((a) => wrap('cac:PaymentMeans',
      req('cbc:PaymentMeansCode', p.meansCode, { name: p.meansText }) + account(a.iban, a.accountName, a.bic))).join('');

  const taxTotal = wrap('cac:TaxTotal',
    amount('TaxAmount', t.taxTotal) +
    t.groups.map((g) => wrap('cac:TaxSubtotal',
      amount('TaxableAmount', g.basis) +
      amount('TaxAmount', g.amount) +
      taxCategory('cac:TaxCategory', g.category, g.rate, g.exemptionCode, g.exemptionReason, profile === 'xrechnung'))).join('')) +   // BR-DE-14
    (hasTaxCurrency ? wrap('cac:TaxTotal', amount('TaxAmount', invoice.taxTotalInTaxCurrencyMinor ?? 0, invoice.taxCurrency)) : '');

  const monetary = wrap('cac:LegalMonetaryTotal',
    amount('LineExtensionAmount', t.lineTotal) +
    amount('TaxExclusiveAmount', t.taxBasis) +
    amount('TaxInclusiveAmount', t.grand) +
    (invoice.allowances?.length ? amount('AllowanceTotalAmount', t.allowance) : '') +
    (invoice.charges?.length ? amount('ChargeTotalAmount', t.charge) : '') +
    (invoice.prepaidMinor === undefined ? '' : amount('PrepaidAmount', t.prepaid)) +
    (invoice.roundingMinor === undefined ? '' : amount('PayableRoundingAmount', t.rounding)) +
    amount('PayableAmount', t.due));

  const d = invoice.delivery;
  const delivery = d ? wrap('cac:Delivery',
    tag('cbc:ActualDeliveryDate', d.date) +                                                 // BT-72
    (d.locationId || d.street || d.city || d.postcode || d.country
      ? wrap('cac:DeliveryLocation', tag('cbc:ID', d.locationId, { schemeID: d.locationIdScheme }) + locationAddress(d)) : '') + // BT-71, BG-15
    wrap('cac:DeliveryParty', wrap('cac:PartyName', tag('cbc:Name', d.partyName)))) : '';   // BT-70

  const tr = invoice.taxRepresentative;
  const taxRep = tr ? wrap('cac:TaxRepresentativeParty',                                    // BG-11
    wrap('cac:PartyName', req('cbc:Name', tr.name)) +
    postal(tr) +
    wrap('cac:PartyTaxScheme', req('cbc:CompanyID', tr.vatId) + scheme('VAT'))) : '';

  const process = businessProcess(profile, invoice.businessProcess);
  const ns = credit ? NS.creditNote : NS.invoice;

  const extraDocs =
    (invoice.attachments ?? []).map((a) => wrap('cac:AdditionalDocumentReference',            // BG-24
      req('cbc:ID', a.id) + tag('cbc:DocumentDescription', a.description) +
      wrap('cac:Attachment',
        tag('cbc:EmbeddedDocumentBinaryObject', a.content, { mimeCode: a.mimeCode, filename: a.filename }) +
        wrap('cac:ExternalReference', tag('cbc:URI', a.url))))).join('') +
    (invoice.invoicedObjectId ? wrap('cac:AdditionalDocumentReference',                        // BT-18
      req('cbc:ID', invoice.invoicedObjectId, { schemeID: invoice.invoicedObjectIdScheme }) + req('cbc:DocumentTypeCode', '130')) : '');
  const payee = invoice.payee;
  const payeeParty = payee ? wrap('cac:PayeeParty',                                           // BG-10
    wrap('cac:PartyIdentification', tag('cbc:ID', payee.id, { schemeID: payee.idScheme })) +
    wrap('cac:PartyName', req('cbc:Name', payee.name)) +
    wrap('cac:PartyLegalEntity', tag('cbc:CompanyID', payee.legalId, { schemeID: payee.legalIdScheme }))) : '';
  const periodHeader = invoice.periodStart || invoice.periodEnd || invoice.taxPointDateCode
    ? wrap('cac:InvoicePeriod', tag('cbc:StartDate', invoice.periodStart) + tag('cbc:EndDate', invoice.periodEnd) +
        tag('cbc:DescriptionCode', invoice.taxPointDateCode))                                 // BG-14, BT-8
    : '';
  const orderRef = invoice.orderReference || invoice.salesOrderReference
    ? wrap('cac:OrderReference', req('cbc:ID', invoice.orderReference ?? 'NA') + tag('cbc:SalesOrderID', invoice.salesOrderReference)) : '';

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<${root} xmlns="${ns}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}">` +
      req('cbc:CustomizationID', options.customizationId ?? CUSTOMIZATION_ID[profile]) +                               // BT-24
      tag('cbc:ProfileID', process) +                                                       // BT-23
      req('cbc:ID', invoice.number) +
      req('cbc:IssueDate', invoice.issueDate) +
      (credit ? '' : tag('cbc:DueDate', invoice.dueDate)) +
      req(credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', invoice.typeCode ?? '380') +
      notes +
      tag('cbc:TaxPointDate', invoice.taxPointDate) +                                       // BT-7
      req('cbc:DocumentCurrencyCode', cur) +
      tag('cbc:TaxCurrencyCode', invoice.taxCurrency) +                                     // BT-6
      tag('cbc:AccountingCost', invoice.buyerAccountingReference) +                         // BT-19
      tag('cbc:BuyerReference', invoice.buyerReference) +                                  // BT-10
      periodHeader +
      orderRef +                                                                            // BT-13, BT-14
      (invoice.precedingInvoices ?? []).map((r) => wrap('cac:BillingReference',            // BG-3
        wrap('cac:InvoiceDocumentReference', req('cbc:ID', r.number) + tag('cbc:IssueDate', r.issueDate)))).join('') +
      wrap('cac:DespatchDocumentReference', tag('cbc:ID', invoice.despatchAdviceReference)) + // BT-16
      wrap('cac:ReceiptDocumentReference', tag('cbc:ID', invoice.receivingAdviceReference)) + // BT-15
      wrap('cac:OriginatorDocumentReference', tag('cbc:ID', invoice.tenderOrLotReference)) +  // BT-17
      wrap('cac:ContractDocumentReference', tag('cbc:ID', invoice.contractReference)) +    // BT-12
      extraDocs +
      wrap('cac:ProjectReference', tag('cbc:ID', invoice.projectReference)) +               // BT-11
      wrap('cac:AccountingSupplierParty', party(invoice.seller, dd?.creditorId)) +
      wrap('cac:AccountingCustomerParty', party(invoice.buyer)) +
      payeeParty +
      taxRep +
      delivery +
      paymentMeans +
      wrap('cac:PaymentTerms', tag('cbc:Note', invoice.paymentTerms)) +                    // BT-20
      (invoice.allowances ?? []).map((a) => allowanceCharge(a, false)).join('') +          // BG-20
      (invoice.charges ?? []).map((c) => allowanceCharge(c, true)).join('') +              // BG-21
      taxTotal +
      monetary +
      lines +
    `</${root}>`;
}
