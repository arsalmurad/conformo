/**
 * EN 16931 CII reader: the inverse of packages/formats/src/cii.ts's buildCII().
 *
 * Walks the same element sequence the writer emits, using the writer's own
 * exported CII_NS so the two sides can never drift on a namespace URI. Two
 * asymmetries with the writer are deliberate, not bugs:
 *   - ram:TypeCode, BilledQuantity/@unitCode and a party's EAS scheme are
 *     mandatory-with-a-default on write (380, C62, EM), so a document that
 *     used the default is indistinguishable from one that set it explicitly.
 *     The reader always returns the literal value; callers that need the
 *     pre-default Invoice should normalize these three fields themselves.
 *   - ram:TotalPrepaidAmount is mandatory in the XSD so it is always present,
 *     even for an invoice with no prepayment. Read back only when non-zero,
 *     which matches every real document and every fixture in this repo.
 */
import type {
  AllowanceCharge, Contact, Delivery, DocumentTypeCode, Invoice, Line, Note, Party,
  PrecedingInvoice, TaxCategory, TaxRepresentative,
} from '@conformo/core';
import { CII_NS } from '@conformo/formats';
import { attr, child, children, descend, text } from '../xml/query.js';
import type { XmlElement } from '../xml/types.js';
import { arrOrUndefined, parseDate102, parseDec, parseMoney, pickLineExemption } from '../values.js';
import type { ExemptionGroup } from '../values.js';

const RSM = CII_NS.rsm;
const RAM = CII_NS.ram;
const UDT = CII_NS.udt;
const QDT = CII_NS.qdt;

function dateTime(el: XmlElement | undefined): string | undefined {
  const s = text(child(el, 'DateTimeString', UDT));
  return s === undefined ? undefined : parseDate102(s);
}

interface AddressLike {
  street?: string; street2?: string; street3?: string;
  city?: string; postcode?: string; subdivision?: string; country?: string;
}

function readAddress(el: XmlElement | undefined): AddressLike {
  return {
    street: text(child(el, 'LineOne', RAM)),
    street2: text(child(el, 'LineTwo', RAM)),
    street3: text(child(el, 'LineThree', RAM)),
    city: text(child(el, 'CityName', RAM)),
    postcode: text(child(el, 'PostcodeCode', RAM)),
    subdivision: text(child(el, 'CountrySubDivisionName', RAM)),
    country: text(child(el, 'CountryID', RAM)),
  };
}

function rateOf(category: string, el: XmlElement | undefined): number {
  if (category === 'O') return 0;
  const s = text(child(el, 'RateApplicablePercent', RAM));
  return s === undefined ? 0 : parseDec(s);
}

function readParty(el: XmlElement): Party {
  const idEl = child(el, 'ID', RAM);
  const legalOrg = child(el, 'SpecifiedLegalOrganization', RAM);
  const legalIdEl = child(legalOrg, 'ID', RAM);
  const contactEl = child(el, 'DefinedTradeContact', RAM);
  const contactName = text(child(contactEl, 'PersonName', RAM));
  const contactPhone = text(descend(contactEl, 'TelephoneUniversalCommunication', 'CompleteNumber'));
  const contactEmail = text(descend(contactEl, 'EmailURIUniversalCommunication', 'URIID'));
  const contact: Contact | undefined = contactName || contactPhone || contactEmail
    ? { name: contactName, phone: contactPhone, email: contactEmail } : undefined;
  const uriIdEl = descend(el, 'URIUniversalCommunication', 'URIID');
  const taxRegs = children(el, 'SpecifiedTaxRegistration', RAM);
  const vatIdEl = taxRegs.map((r) => child(r, 'ID', RAM)).find((idNode) => attr(idNode, 'schemeID') === 'VA');
  const taxRegIdEl = taxRegs.map((r) => child(r, 'ID', RAM)).find((idNode) => attr(idNode, 'schemeID') === 'FC');

  return {
    name: text(child(el, 'Name', RAM))!,
    tradingName: text(child(legalOrg, 'TradingBusinessName', RAM)),
    id: text(idEl),
    idScheme: attr(idEl, 'schemeID'),
    legalId: text(legalIdEl),
    legalIdScheme: attr(legalIdEl, 'schemeID'),
    vatId: text(vatIdEl),
    taxRegistrationId: text(taxRegIdEl),
    additionalLegalInfo: text(child(el, 'Description', RAM)),
    ...readAddress(child(el, 'PostalTradeAddress', RAM)),
    country: text(descend(el, 'PostalTradeAddress', 'CountryID'))!,
    electronicAddress: text(uriIdEl),
    electronicAddressScheme: attr(uriIdEl, 'schemeID'),
    contact,
  };
}

function readAllowanceCharge(el: XmlElement, exemptionGroups: ExemptionGroup[]): { entry: AllowanceCharge; isCharge: boolean } {
  const isCharge = text(descend(el, 'ChargeIndicator', 'Indicator')) === 'true';
  const catTax = child(el, 'CategoryTradeTax', RAM);
  const category = text(child(catTax, 'CategoryCode', RAM)) as TaxCategory;
  const percentText = text(child(el, 'CalculationPercent', RAM));
  const baseText = text(child(el, 'BasisAmount', RAM));
  const rate = rateOf(category, catTax);
  const exemption = pickLineExemption(exemptionGroups, category, rate);
  return {
    isCharge,
    entry: {
      amountMinor: parseMoney(text(child(el, 'ActualAmount', RAM))!),
      baseAmountMinor: baseText === undefined ? undefined : parseMoney(baseText),
      percent: percentText === undefined ? undefined : parseDec(percentText),
      reason: text(child(el, 'Reason', RAM)),
      reasonCode: text(child(el, 'ReasonCode', RAM)),
      taxCategory: category,
      taxRate: rate,
      exemptionCode: exemption.code,
      exemptionReason: exemption.reason,
    },
  };
}

function readLine(el: XmlElement, exemptionGroups: ExemptionGroup[]): Line {
  const product = child(el, 'SpecifiedTradeProduct', RAM)!;
  const globalIdEl = child(product, 'GlobalID', RAM);
  const agreement = child(el, 'SpecifiedLineTradeAgreement', RAM);
  const delivery = child(el, 'SpecifiedLineTradeDelivery', RAM);
  const settlement = child(el, 'SpecifiedLineTradeSettlement', RAM);
  const taxEl = child(settlement, 'ApplicableTradeTax', RAM);
  const category = text(child(taxEl, 'CategoryCode', RAM)) as TaxCategory;
  const qtyEl = child(delivery, 'BilledQuantity', RAM);
  const rate = rateOf(category, taxEl);
  const exemption = pickLineExemption(exemptionGroups, category, rate);

  return {
    name: text(child(product, 'Name', RAM))!,
    description: text(child(product, 'Description', RAM)),
    sellerAssignedId: text(child(product, 'SellerAssignedID', RAM)),
    buyerAssignedId: text(child(product, 'BuyerAssignedID', RAM)),
    standardItemId: text(globalIdEl),
    standardItemIdScheme: attr(globalIdEl, 'schemeID'),
    originCountry: text(descend(product, 'OriginTradeCountry', 'ID')),
    quantity: parseDec(text(qtyEl)!),
    unitPriceMinor: parseMoney(text(descend(agreement, 'NetPriceProductTradePrice', 'ChargeAmount'))!),
    unitCode: attr(qtyEl, 'unitCode'),
    taxCategory: category,
    taxRate: rate,
    exemptionCode: exemption.code,
    exemptionReason: exemption.reason,
  };
}

function readNote(el: XmlElement): Note {
  return { text: text(child(el, 'Content', RAM))!, subjectCode: text(child(el, 'SubjectCode', RAM)) };
}

function readPrecedingInvoice(el: XmlElement): PrecedingInvoice {
  const formatted = child(el, 'FormattedIssueDateTime', RAM);
  const dt = text(child(formatted, 'DateTimeString', QDT));
  return { number: text(child(el, 'IssuerAssignedID', RAM))!, issueDate: dt === undefined ? undefined : parseDate102(dt) };
}

export function readCII(root: XmlElement): Invoice {
  const ctx = child(root, 'ExchangedDocumentContext', RSM);
  const doc = child(root, 'ExchangedDocument', RSM)!;
  const txn = child(root, 'SupplyChainTradeTransaction', RSM)!;
  const agreement = child(txn, 'ApplicableHeaderTradeAgreement', RAM)!;
  const deliveryEl = child(txn, 'ApplicableHeaderTradeDelivery', RAM);
  const settlement = child(txn, 'ApplicableHeaderTradeSettlement', RAM)!;
  const paymentMeansEl = child(settlement, 'SpecifiedTradeSettlementPaymentMeans', RAM)!;
  const acctEl = child(paymentMeansEl, 'PayeePartyCreditorFinancialAccount', RAM);
  const instEl = child(paymentMeansEl, 'PayeeSpecifiedCreditorFinancialInstitution', RAM);
  const monetary = child(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation', RAM)!;
  const periodEl = child(settlement, 'BillingSpecifiedPeriod', RAM);

  const currency = text(child(settlement, 'InvoiceCurrencyCode', RAM))!;
  const taxCurrency = text(child(settlement, 'TaxCurrencyCode', RAM));
  const taxTotalEls = children(monetary, 'TaxTotalAmount', RAM);
  const taxTotalInTaxCurrency = taxCurrency
    ? taxTotalEls.find((e) => attr(e, 'currencyID') === taxCurrency) : undefined;

  // BG-23 breakdown: the only place a line's or allowance/charge's own
  // exemptionCode/exemptionReason survive on the wire. See pickLineExemption().
  const exemptionGroups: ExemptionGroup[] = children(settlement, 'ApplicableTradeTax', RAM).map((g) => {
    const gCategory = text(child(g, 'CategoryCode', RAM))!;
    return {
      category: gCategory,
      rate: rateOf(gCategory, g),
      code: text(child(g, 'ExemptionReasonCode', RAM)),
      reason: text(child(g, 'ExemptionReason', RAM)),
    };
  });

  const trEl = child(agreement, 'SellerTaxRepresentativeTradeParty', RAM);
  const taxRepresentative: TaxRepresentative | undefined = trEl ? {
    name: text(child(trEl, 'Name', RAM))!,
    ...readAddress(child(trEl, 'PostalTradeAddress', RAM)),
    country: text(descend(trEl, 'PostalTradeAddress', 'CountryID'))!,
    vatId: text(descend(trEl, 'SpecifiedTaxRegistration', 'ID'))!,
  } : undefined;

  const shipTo = child(deliveryEl, 'ShipToTradeParty', RAM);
  const deliveryEvent = child(deliveryEl, 'ActualDeliverySupplyChainEvent', RAM);
  const delivery: Delivery | undefined = shipTo || deliveryEvent ? {
    partyName: text(child(shipTo, 'Name', RAM)),
    date: dateTime(child(deliveryEvent, 'OccurrenceDateTime', RAM)),
    street: text(descend(shipTo, 'PostalTradeAddress', 'LineOne')),
    city: text(descend(shipTo, 'PostalTradeAddress', 'CityName')),
    postcode: text(descend(shipTo, 'PostalTradeAddress', 'PostcodeCode')),
    country: text(descend(shipTo, 'PostalTradeAddress', 'CountryID')),
  } : undefined;

  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  for (const el of children(settlement, 'SpecifiedTradeAllowanceCharge', RAM)) {
    const { entry, isCharge } = readAllowanceCharge(el, exemptionGroups);
    (isCharge ? charges : allowances).push(entry);
  }

  const paymentTermsEl = child(settlement, 'SpecifiedTradePaymentTerms', RAM);
  const prepaidText = text(child(monetary, 'TotalPrepaidAmount', RAM));
  const prepaidMinor = prepaidText === undefined ? undefined : parseMoney(prepaidText);
  const roundingText = text(child(monetary, 'RoundingAmount', RAM));

  return {
    number: text(child(doc, 'ID', RAM))!,
    typeCode: text(child(doc, 'TypeCode', RAM)) as DocumentTypeCode,
    issueDate: dateTime(child(doc, 'IssueDateTime', RAM))!,
    dueDate: dateTime(child(paymentTermsEl, 'DueDateDateTime', RAM)),
    currency,
    taxCurrency,
    taxTotalInTaxCurrencyMinor: taxTotalInTaxCurrency ? parseMoney(text(taxTotalInTaxCurrency)!) : undefined,
    buyerReference: text(child(agreement, 'BuyerReference', RAM)),
    contractReference: text(descend(agreement, 'ContractReferencedDocument', 'IssuerAssignedID')),
    orderReference: text(descend(agreement, 'BuyerOrderReferencedDocument', 'IssuerAssignedID')),
    businessProcess: text(descend(ctx, 'BusinessProcessSpecifiedDocumentContextParameter', 'ID')),
    notes: arrOrUndefined(children(doc, 'IncludedNote', RAM).map(readNote)),
    paymentTerms: text(child(paymentTermsEl, 'Description', RAM)),
    seller: readParty(child(agreement, 'SellerTradeParty', RAM)!),
    buyer: readParty(child(agreement, 'BuyerTradeParty', RAM)!),
    taxRepresentative,
    delivery,
    periodStart: dateTime(child(periodEl, 'StartDateTime', RAM)),
    periodEnd: dateTime(child(periodEl, 'EndDateTime', RAM)),
    precedingInvoices: arrOrUndefined(children(settlement, 'InvoiceReferencedDocument', RAM).map(readPrecedingInvoice)),
    payment: {
      meansCode: text(child(paymentMeansEl, 'TypeCode', RAM))!,
      meansText: text(child(paymentMeansEl, 'Information', RAM)),
      reference: text(child(settlement, 'PaymentReference', RAM)),
      iban: text(child(acctEl, 'IBANID', RAM)),
      accountName: text(child(acctEl, 'AccountName', RAM)),
      bic: text(child(instEl, 'BICID', RAM)),
    },
    lines: children(txn, 'IncludedSupplyChainTradeLineItem', RAM).map((el) => readLine(el, exemptionGroups)),
    allowances: allowances.length ? allowances : undefined,
    charges: charges.length ? charges : undefined,
    prepaidMinor: prepaidMinor ? prepaidMinor : undefined,
    roundingMinor: roundingText === undefined ? undefined : parseMoney(roundingText),
  };
}
