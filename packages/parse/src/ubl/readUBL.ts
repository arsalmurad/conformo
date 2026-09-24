/**
 * UBL 2.1 reader: the inverse of packages/formats/src/ubl.ts's buildUBL().
 * Handles both an Invoice root and a CreditNote root, exactly as the writer
 * does, using the writer's own exported UBL_NS.
 *
 * Same two asymmetries as readCII.ts, for the same mandatory-with-a-default
 * reasons: BilledQuantity/@unitCode (default C62) and a party's EAS scheme
 * (default EM) are read back literally, not un-defaulted.
 */
import type {
  AllowanceCharge, Contact, Delivery, DocumentTypeCode, Invoice, Line, Note, Party,
  PrecedingInvoice, TaxCategory, TaxRepresentative,
} from '@conformo/core';
import { UBL_NS } from '@conformo/formats';
import { attr, child, children, descend, text } from '../xml/query.js';
import type { XmlElement } from '../xml/types.js';
import { arrOrUndefined, parseDec, parseMoney, pickLineExemption } from '../values.js';
import type { ExemptionGroup } from '../values.js';

const CAC = UBL_NS.cac;
const CBC = UBL_NS.cbc;

function rateOf(category: string, el: XmlElement | undefined): number {
  if (category === 'O') return 0;
  const s = text(child(el, 'Percent', CBC));
  return s === undefined ? 0 : parseDec(s);
}

// Inverse of the writer's "#AAB#text" BT-21 encoding (UBL has no dedicated
// subject-code element).
function readNote(raw: string): Note {
  const m = /^#([A-Za-z0-9]+)#([\s\S]*)$/.exec(raw);
  return m ? { subjectCode: m[1]!, text: m[2]! } : { text: raw };
}

function readParty(wrapperEl: XmlElement): Party {
  const el = child(wrapperEl, 'Party', CAC)!;
  const endpointEl = child(el, 'EndpointID', CBC);
  const idEl = descend(el, 'PartyIdentification', 'ID');
  const addr = child(el, 'PostalAddress', CAC);
  const legalEl = child(el, 'PartyLegalEntity', CAC)!;
  const legalIdEl = child(legalEl, 'CompanyID', CBC);
  const contactEl = child(el, 'Contact', CAC);
  const contactName = text(child(contactEl, 'Name', CBC));
  const contactPhone = text(child(contactEl, 'Telephone', CBC));
  const contactEmail = text(child(contactEl, 'ElectronicMail', CBC));
  const contact: Contact | undefined = contactName || contactPhone || contactEmail
    ? { name: contactName, phone: contactPhone, email: contactEmail } : undefined;

  const taxSchemes = children(el, 'PartyTaxScheme', CAC);
  const schemeOf = (ts: XmlElement) => text(descend(ts, 'TaxScheme', 'ID'));
  const vatTs = taxSchemes.find((ts) => schemeOf(ts) === 'VAT');
  const fcTs = taxSchemes.find((ts) => schemeOf(ts) === 'FC');

  return {
    name: text(child(legalEl, 'RegistrationName', CBC))!,
    tradingName: text(descend(el, 'PartyName', 'Name')),
    id: text(idEl),
    idScheme: attr(idEl, 'schemeID'),
    legalId: text(legalIdEl),
    legalIdScheme: attr(legalIdEl, 'schemeID'),
    vatId: text(child(vatTs, 'CompanyID', CBC)),
    taxRegistrationId: text(child(fcTs, 'CompanyID', CBC)),
    additionalLegalInfo: text(child(legalEl, 'CompanyLegalForm', CBC)),
    street: text(child(addr, 'StreetName', CBC)),
    street2: text(child(addr, 'AdditionalStreetName', CBC)),
    street3: text(descend(addr, 'AddressLine', 'Line')),
    city: text(child(addr, 'CityName', CBC)),
    postcode: text(child(addr, 'PostalZone', CBC)),
    subdivision: text(child(addr, 'CountrySubentity', CBC)),
    country: text(descend(addr, 'Country', 'IdentificationCode'))!,
    electronicAddress: text(endpointEl),
    electronicAddressScheme: attr(endpointEl, 'schemeID'),
    contact,
  };
}

function readAllowanceCharge(el: XmlElement, exemptionGroups: ExemptionGroup[]): { entry: AllowanceCharge; isCharge: boolean } {
  const isCharge = text(child(el, 'ChargeIndicator', CBC)) === 'true';
  const catEl = child(el, 'TaxCategory', CAC);
  const category = text(child(catEl, 'ID', CBC)) as TaxCategory;
  const percentText = text(child(el, 'MultiplierFactorNumeric', CBC));
  const baseText = text(child(el, 'BaseAmount', CBC));
  const rate = rateOf(category, catEl);
  const exemption = pickLineExemption(exemptionGroups, category, rate);
  return {
    isCharge,
    entry: {
      amountMinor: parseMoney(text(child(el, 'Amount', CBC))!),
      baseAmountMinor: baseText === undefined ? undefined : parseMoney(baseText),
      percent: percentText === undefined ? undefined : parseDec(percentText),
      reason: text(child(el, 'AllowanceChargeReason', CBC)),
      reasonCode: text(child(el, 'AllowanceChargeReasonCode', CBC)),
      taxCategory: category,
      taxRate: rate,
      exemptionCode: exemption.code,
      exemptionReason: exemption.reason,
    },
  };
}

function readLine(el: XmlElement, credit: boolean, exemptionGroups: ExemptionGroup[]): Line {
  const item = child(el, 'Item', CAC)!;
  const qtyEl = child(el, credit ? 'CreditedQuantity' : 'InvoicedQuantity', CBC);
  const standardIdEl = descend(item, 'StandardItemIdentification', 'ID');
  const taxCatEl = child(item, 'ClassifiedTaxCategory', CAC);
  const category = text(child(taxCatEl, 'ID', CBC)) as TaxCategory;
  const rate = rateOf(category, taxCatEl);
  const exemption = pickLineExemption(exemptionGroups, category, rate);

  return {
    name: text(child(item, 'Name', CBC))!,
    description: text(child(item, 'Description', CBC)),
    sellerAssignedId: text(descend(item, 'SellersItemIdentification', 'ID')),
    buyerAssignedId: text(descend(item, 'BuyersItemIdentification', 'ID')),
    standardItemId: text(standardIdEl),
    standardItemIdScheme: attr(standardIdEl, 'schemeID'),
    originCountry: text(descend(item, 'OriginCountry', 'IdentificationCode')),
    quantity: parseDec(text(qtyEl)!),
    unitPriceMinor: parseMoney(text(descend(el, 'Price', 'PriceAmount'))!),
    unitCode: attr(qtyEl, 'unitCode'),
    taxCategory: category,
    taxRate: rate,
    exemptionCode: exemption.code,
    exemptionReason: exemption.reason,
  };
}

function readPrecedingInvoice(el: XmlElement): PrecedingInvoice {
  const ref = descend(el, 'InvoiceDocumentReference')!;
  return { number: text(child(ref, 'ID', CBC))!, issueDate: text(child(ref, 'IssueDate', CBC)) };
}

export function readUBL(root: XmlElement): Invoice {
  const credit = root.namespaceURI === UBL_NS.creditNote;
  const paymentMeansEl = child(root, 'PaymentMeans', CAC);
  const monetary = child(root, 'LegalMonetaryTotal', CAC)!;
  const periodEl = child(root, 'InvoicePeriod', CAC);
  const taxTotalEls = children(root, 'TaxTotal', CAC);
  const taxCurrency = text(child(root, 'TaxCurrencyCode', CBC));
  const taxTotalInTaxCurrency = taxCurrency && taxTotalEls.length > 1 ? taxTotalEls[1] : undefined;

  const trEl = child(root, 'TaxRepresentativeParty', CAC);
  const taxRepresentative: TaxRepresentative | undefined = trEl ? {
    name: text(descend(trEl, 'PartyName', 'Name'))!,
    street: text(descend(trEl, 'PostalAddress', 'StreetName')),
    street2: text(descend(trEl, 'PostalAddress', 'AdditionalStreetName')),
    city: text(descend(trEl, 'PostalAddress', 'CityName')),
    postcode: text(descend(trEl, 'PostalAddress', 'PostalZone')),
    subdivision: text(descend(trEl, 'PostalAddress', 'CountrySubentity')),
    country: text(descend(trEl, 'PostalAddress', 'Country', 'IdentificationCode'))!,
    vatId: text(descend(trEl, 'PartyTaxScheme', 'CompanyID'))!,
  } : undefined;

  const deliveryEl = child(root, 'Delivery', CAC);
  const deliveryLocation = child(deliveryEl, 'DeliveryLocation', CAC);
  const delivery: Delivery | undefined = deliveryEl ? {
    partyName: text(descend(deliveryEl, 'DeliveryParty', 'PartyName', 'Name')),
    date: text(child(deliveryEl, 'ActualDeliveryDate', CBC)),
    street: text(descend(deliveryLocation, 'Address', 'StreetName')),
    city: text(descend(deliveryLocation, 'Address', 'CityName')),
    postcode: text(descend(deliveryLocation, 'Address', 'PostalZone')),
    country: text(descend(deliveryLocation, 'Address', 'Country', 'IdentificationCode')),
  } : undefined;

  const acctEl = child(paymentMeansEl, 'PayeeFinancialAccount', CAC);
  const paymentMeansCodeEl = child(paymentMeansEl, 'PaymentMeansCode', CBC);

  // BG-23 breakdown: the only place a line's or allowance/charge's own
  // exemptionCode/exemptionReason survive on the wire. See pickLineExemption().
  const exemptionGroups: ExemptionGroup[] = children(taxTotalEls[0], 'TaxSubtotal', CAC).map((sub) => {
    const catEl = child(sub, 'TaxCategory', CAC);
    const gCategory = text(child(catEl, 'ID', CBC))!;
    return {
      category: gCategory,
      rate: rateOf(gCategory, catEl),
      code: text(child(catEl, 'TaxExemptionReasonCode', CBC)),
      reason: text(child(catEl, 'TaxExemptionReason', CBC)),
    };
  });

  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const el of children(root, 'AllowanceCharge', CAC)) {
    const { entry, isCharge } = readAllowanceCharge(el, exemptionGroups);
    (isCharge ? charges : allowances).push(entry);
  }

  const prepaidText = text(child(monetary, 'PrepaidAmount', CBC));
  const roundingText = text(child(monetary, 'PayableRoundingAmount', CBC));

  return {
    number: text(child(root, 'ID', CBC))!,
    typeCode: text(child(root, credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode', CBC)) as DocumentTypeCode,
    issueDate: text(child(root, 'IssueDate', CBC))!,
    dueDate: credit ? text(child(paymentMeansEl, 'PaymentDueDate', CBC)) : text(child(root, 'DueDate', CBC)),
    currency: text(child(root, 'DocumentCurrencyCode', CBC))!,
    taxCurrency,
    taxTotalInTaxCurrencyMinor: taxTotalInTaxCurrency
      ? parseMoney(text(child(taxTotalInTaxCurrency, 'TaxAmount', CBC))!) : undefined,
    buyerReference: text(child(root, 'BuyerReference', CBC)),
    contractReference: text(descend(root, 'ContractDocumentReference', 'ID')),
    orderReference: text(descend(root, 'OrderReference', 'ID')),
    businessProcess: text(child(root, 'ProfileID', CBC)),
    notes: arrOrUndefined(children(root, 'Note', CBC).map((el) => readNote(text(el)!))),
    paymentTerms: text(descend(root, 'PaymentTerms', 'Note')),
    seller: readParty(child(root, 'AccountingSupplierParty', CAC)!),
    buyer: readParty(child(root, 'AccountingCustomerParty', CAC)!),
    taxRepresentative,
    delivery,
    periodStart: text(child(periodEl, 'StartDate', CBC)),
    periodEnd: text(child(periodEl, 'EndDate', CBC)),
    precedingInvoices: arrOrUndefined(children(root, 'BillingReference', CAC).map(readPrecedingInvoice)),
    payment: {
      meansCode: text(paymentMeansCodeEl)!,
      meansText: attr(paymentMeansCodeEl, 'name'),
      reference: text(child(paymentMeansEl, 'PaymentID', CBC)),
      iban: text(child(acctEl, 'ID', CBC)),
      accountName: text(child(acctEl, 'Name', CBC)),
      bic: text(descend(acctEl, 'FinancialInstitutionBranch', 'ID')),
    },
    lines: children(root, credit ? 'CreditNoteLine' : 'InvoiceLine', CAC)
      .map((el) => readLine(el, credit, exemptionGroups)),
    allowances: arrOrUndefined(allowances),
    charges: arrOrUndefined(charges),
    prepaidMinor: prepaidText === undefined ? undefined : parseMoney(prepaidText),
    roundingMinor: roundingText === undefined ? undefined : parseMoney(roundingText),
  };
}
