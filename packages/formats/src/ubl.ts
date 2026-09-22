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
import { totals, lineNet } from '@invoice-engine/core';
import type { AllowanceCharge, Invoice, Party, TaxCategory } from '@invoice-engine/core';
import { assertSerializable, dec, electronicAddressScheme, money, req, tag, wrap } from './xml.js';
import { CUSTOMIZATION_ID, businessProcess } from './profiles.js';
import type { Profile } from './profiles.js';

const NS = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  creditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
} as const;

export interface UBLOptions {
  profile?: Profile;
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
const percent = (category: TaxCategory, r: number): string =>
  category === 'O' ? '' : tag('cbc:Percent', dec(r));

const taxCategory = (name: string, category: TaxCategory, r: number, code?: string, reason?: string): string =>
  wrap(name,
    req('cbc:ID', category) +
    percent(category, r) +
    tag('cbc:TaxExemptionReasonCode', code) +
    tag('cbc:TaxExemptionReason', reason) +
    scheme('VAT'));

// Party is a strict sequence: EndpointID, PartyIdentification, PartyName, PostalAddress,
// PartyTaxScheme, PartyLegalEntity, Contact.
const party = (p: Party): string => wrap('cac:Party',
  tag('cbc:EndpointID', p.electronicAddress, { schemeID: electronicAddressScheme(p) }) +   // BT-34 / BT-49
  wrap('cac:PartyIdentification', tag('cbc:ID', p.id, { schemeID: p.idScheme })) +          // BT-29 / BT-46
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
  assertSerializable(invoice);
  const t = totals(invoice);
  const cur = invoice.currency;
  const credit = invoice.typeCode === '381';
  const root = credit ? 'CreditNote' : 'Invoice';
  const amount = (name: string, minor: number, currency = cur): string =>
    req(`cbc:${name}`, money(minor), { currencyID: currency });
  const hasTaxCurrency = !!invoice.taxCurrency && invoice.taxCurrency !== cur;

  const allowanceCharge = (a: AllowanceCharge, isCharge: boolean): string => wrap('cac:AllowanceCharge',
    req('cbc:ChargeIndicator', isCharge ? 'true' : 'false') +
    tag('cbc:AllowanceChargeReasonCode', a.reasonCode) +
    tag('cbc:AllowanceChargeReason', a.reason) +
    tag('cbc:MultiplierFactorNumeric', a.percent === undefined ? undefined : dec(a.percent)) +
    amount('Amount', a.amountMinor) +
    (a.baseAmountMinor === undefined ? '' : amount('BaseAmount', a.baseAmountMinor)) +
    taxCategory('cac:TaxCategory', a.taxCategory, a.taxRate));

  const lines = invoice.lines.map((l, i) => wrap(credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
    req('cbc:ID', String(i + 1)) +
    req(credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', dec(l.quantity), { unitCode: l.unitCode ?? 'C62' }) +
    amount('LineExtensionAmount', lineNet(l)) +
    wrap('cac:Item',
      tag('cbc:Description', l.description) +
      req('cbc:Name', l.name) +
      wrap('cac:BuyersItemIdentification', tag('cbc:ID', l.buyerAssignedId)) +              // BT-156
      wrap('cac:SellersItemIdentification', tag('cbc:ID', l.sellerAssignedId)) +            // BT-155
      wrap('cac:StandardItemIdentification',                                                // BT-157
        tag('cbc:ID', l.standardItemId, { schemeID: l.standardItemIdScheme })) +
      wrap('cac:OriginCountry', tag('cbc:IdentificationCode', l.originCountry)) +           // BT-159
      taxCategory('cac:ClassifiedTaxCategory', l.taxCategory, l.taxRate)) +
    wrap('cac:Price', amount('PriceAmount', l.unitPriceMinor)))).join('');

  const notes = (invoice.notes ?? []).map((n) =>
    tag('cbc:Note', n.subjectCode ? `#${n.subjectCode}#${n.text}` : n.text)).join('');

  const p = invoice.payment;
  const paymentMeans = wrap('cac:PaymentMeans',
    req('cbc:PaymentMeansCode', p.meansCode, { name: p.meansText }) +                       // BT-81, BT-82
    (credit ? tag('cbc:PaymentDueDate', invoice.dueDate) : '') +                            // BT-9, CreditNote only
    tag('cbc:PaymentID', p.reference) +                                                     // BT-83
    wrap('cac:PayeeFinancialAccount',
      tag('cbc:ID', p.iban) +                                                               // BT-84
      tag('cbc:Name', p.accountName) +                                                      // BT-85
      wrap('cac:FinancialInstitutionBranch', tag('cbc:ID', p.bic))));                       // BT-86

  const taxTotal = wrap('cac:TaxTotal',
    amount('TaxAmount', t.taxTotal) +
    t.groups.map((g) => wrap('cac:TaxSubtotal',
      amount('TaxableAmount', g.basis) +
      amount('TaxAmount', g.amount) +
      taxCategory('cac:TaxCategory', g.category, g.rate, g.exemptionCode, g.exemptionReason))).join('')) +
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
    (d.street || d.city || d.postcode || d.country ? wrap('cac:DeliveryLocation', locationAddress(d)) : '') + // BG-15
    wrap('cac:DeliveryParty', wrap('cac:PartyName', tag('cbc:Name', d.partyName)))) : '';   // BT-70

  const tr = invoice.taxRepresentative;
  const taxRep = tr ? wrap('cac:TaxRepresentativeParty',                                    // BG-11
    wrap('cac:PartyName', req('cbc:Name', tr.name)) +
    postal(tr) +
    wrap('cac:PartyTaxScheme', req('cbc:CompanyID', tr.vatId) + scheme('VAT'))) : '';

  const process = businessProcess(profile, invoice.businessProcess);
  const ns = credit ? NS.creditNote : NS.invoice;

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<${root} xmlns="${ns}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}">` +
      req('cbc:CustomizationID', CUSTOMIZATION_ID[profile]) +                               // BT-24
      tag('cbc:ProfileID', process) +                                                       // BT-23
      req('cbc:ID', invoice.number) +
      req('cbc:IssueDate', invoice.issueDate) +
      (credit ? '' : tag('cbc:DueDate', invoice.dueDate)) +
      req(credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', invoice.typeCode ?? '380') +
      notes +
      req('cbc:DocumentCurrencyCode', cur) +
      tag('cbc:TaxCurrencyCode', hasTaxCurrency ? invoice.taxCurrency : undefined) +        // BT-6
      tag('cbc:BuyerReference', invoice.buyerReference) +                                  // BT-10
      (invoice.periodStart || invoice.periodEnd                                            // BG-14
        ? wrap('cac:InvoicePeriod', tag('cbc:StartDate', invoice.periodStart) + tag('cbc:EndDate', invoice.periodEnd))
        : '') +
      wrap('cac:OrderReference', tag('cbc:ID', invoice.orderReference)) +                  // BT-13
      (invoice.precedingInvoices ?? []).map((r) => wrap('cac:BillingReference',            // BG-3
        wrap('cac:InvoiceDocumentReference', req('cbc:ID', r.number) + tag('cbc:IssueDate', r.issueDate)))).join('') +
      wrap('cac:ContractDocumentReference', tag('cbc:ID', invoice.contractReference)) +    // BT-12
      wrap('cac:AccountingSupplierParty', party(invoice.seller)) +
      wrap('cac:AccountingCustomerParty', party(invoice.buyer)) +
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
