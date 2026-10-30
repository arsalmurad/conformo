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
  AllowanceCharge, Attachment, Contact, Delivery, DocumentTypeCode, Invoice, Line, LineAllowanceCharge, Note, Party,
  Payee, Payment, PrecedingInvoice, TaxCategory, TaxRepresentative,
} from '@conformo/core';
import { computedLineNet } from '@conformo/core';
import { UBL_NS } from '@conformo/formats';
import { attr, child, children, descend, text } from '../xml/query.js';
import type { XmlElement } from '../xml/types.js';
import { arrOrUndefined, dropDefaultLineIds, parseDec, parseMoney, parsePrice, pickLineExemption } from '../values.js';
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

function readParty(wrapperEl: XmlElement): { party: Party; sepaCreditorId?: string } {
  const el = child(wrapperEl, 'Party', CAC)!;
  const endpointEl = child(el, 'EndpointID', CBC);
  const allIds = children(el, 'PartyIdentification', CAC).map((pi) => child(pi, 'ID', CBC)!).filter(Boolean)
    .map((e) => ({ id: text(e)!, scheme: attr(e, 'schemeID') }));
  const sepaCreditorId = allIds.find((x) => x.scheme === 'SEPA')?.id;   // BT-90 travels as a seller identifier
  const ids = allIds.filter((x) => x.scheme !== 'SEPA');
  const addr = child(el, 'PostalAddress', CAC);
  const legalEl = child(el, 'PartyLegalEntity', CAC);
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

  const party: Party = {
    name: text(child(legalEl, 'RegistrationName', CBC))!,
    tradingName: text(descend(el, 'PartyName', 'Name')),
    id: ids[0]?.id,
    idScheme: ids[0]?.scheme,
    additionalIds: arrOrUndefined(ids.slice(1)),
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
  return { party, sepaCreditorId };
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

function readLineAC(el: XmlElement): { entry: LineAllowanceCharge; isCharge: boolean } {
  const percentText = text(child(el, 'MultiplierFactorNumeric', CBC));
  const baseText = text(child(el, 'BaseAmount', CBC));
  return {
    isCharge: text(child(el, 'ChargeIndicator', CBC)) === 'true',
    entry: {
      amountMinor: parseMoney(text(child(el, 'Amount', CBC))!),
      baseAmountMinor: baseText === undefined ? undefined : parseMoney(baseText),
      percent: percentText === undefined ? undefined : parseDec(percentText),
      reason: text(child(el, 'AllowanceChargeReason', CBC)),
      reasonCode: text(child(el, 'AllowanceChargeReasonCode', CBC)),
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
  const priceEl = child(el, 'Price', CAC);
  const baseQtyEl = child(priceEl, 'BaseQuantity', CBC);
  const priceAc = children(priceEl, 'AllowanceCharge', CAC).find((a) => text(child(a, 'ChargeIndicator', CBC)) === 'false');
  const periodEl = child(el, 'InvoicePeriod', CAC);
  const objectRef = children(el, 'DocumentReference', CAC).find((d) => text(child(d, 'DocumentTypeCode', CBC)) === '130');
  const objectIdEl = child(objectRef, 'ID', CBC);
  const allowances: LineAllowanceCharge[] = [];
  const charges: LineAllowanceCharge[] = [];
  for (const ac of children(el, 'AllowanceCharge', CAC)) {
    const { entry, isCharge } = readLineAC(ac);
    (isCharge ? charges : allowances).push(entry);
  }
  const discount = text(child(priceAc, 'Amount', CBC));
  const gross = text(child(priceAc, 'BaseAmount', CBC));

  const stated = text(child(el, 'LineExtensionAmount', CBC));
  const line: Line = {
    id: text(child(el, 'ID', CBC)),
    note: text(child(el, 'Note', CBC)),
    objectId: text(objectIdEl),
    objectIdScheme: attr(objectIdEl, 'schemeID'),
    orderLineReference: text(descend(el, 'OrderLineReference', 'LineID')),
    buyerAccountingReference: text(child(el, 'AccountingCost', CBC)),
    periodStart: text(child(periodEl, 'StartDate', CBC)),
    periodEnd: text(child(periodEl, 'EndDate', CBC)),
    name: text(child(item, 'Name', CBC))!,
    description: text(child(item, 'Description', CBC)),
    sellerAssignedId: text(descend(item, 'SellersItemIdentification', 'ID')),
    buyerAssignedId: text(descend(item, 'BuyersItemIdentification', 'ID')),
    standardItemId: text(standardIdEl),
    standardItemIdScheme: attr(standardIdEl, 'schemeID'),
    classifications: arrOrUndefined(children(item, 'CommodityClassification', CAC).map((c) => {
      const code = child(c, 'ItemClassificationCode', CBC);
      return { code: text(code)!, scheme: attr(code, 'listID')!, schemeVersion: attr(code, 'listVersionID') };
    })),
    originCountry: text(descend(item, 'OriginCountry', 'IdentificationCode')),
    attributes: arrOrUndefined(children(item, 'AdditionalItemProperty', CAC).map((a) => ({
      name: text(child(a, 'Name', CBC))!, value: text(child(a, 'Value', CBC))!,
    }))),
    quantity: parseDec(text(qtyEl)!),
    unitPriceMinor: parsePrice(text(child(priceEl, 'PriceAmount', CBC))!),
    priceDiscountMinor: discount === undefined ? undefined : parsePrice(discount),
    grossPriceMinor: gross === undefined ? undefined : parsePrice(gross),
    priceBaseQuantity: baseQtyEl ? parseDec(text(baseQtyEl)!) : undefined,
    priceBaseUnitCode: attr(baseQtyEl, 'unitCode'),
    unitCode: attr(qtyEl, 'unitCode'),
    allowances: arrOrUndefined(allowances),
    charges: arrOrUndefined(charges),
    taxCategory: category,
    taxRate: rate,
    exemptionCode: exemption.code,
    exemptionReason: exemption.reason,
  };
  if (stated !== undefined && parseMoney(stated) !== computedLineNet(line)) line.netAmountMinor = parseMoney(stated);
  return line;
}

function readPrecedingInvoice(el: XmlElement): PrecedingInvoice {
  const ref = descend(el, 'InvoiceDocumentReference')!;
  return { number: text(child(ref, 'ID', CBC))!, issueDate: text(child(ref, 'IssueDate', CBC)) };
}

export function readUBL(root: XmlElement): Invoice {
  const credit = root.namespaceURI === UBL_NS.creditNote;
  const paymentMeansAll = children(root, 'PaymentMeans', CAC);
  const paymentMeansEl = paymentMeansAll[0];
  const monetary = child(root, 'LegalMonetaryTotal', CAC)!;
  const periodEl = child(root, 'InvoicePeriod', CAC);
  const seller = readParty(child(root, 'AccountingSupplierParty', CAC)!);
  const taxTotalEls = children(root, 'TaxTotal', CAC);
  const taxCurrency = text(child(root, 'TaxCurrencyCode', CBC));
  const taxTotalInTaxCurrency = taxCurrency && taxTotalEls.length > 1 ? taxTotalEls[1] : undefined;

  const trEl = child(root, 'TaxRepresentativeParty', CAC);
  const taxRepresentative: TaxRepresentative | undefined = trEl ? {
    name: text(descend(trEl, 'PartyName', 'Name'))!,
    street: text(descend(trEl, 'PostalAddress', 'StreetName')),
    street2: text(descend(trEl, 'PostalAddress', 'AdditionalStreetName')),
    street3: text(descend(trEl, 'PostalAddress', 'AddressLine', 'Line')),
    city: text(descend(trEl, 'PostalAddress', 'CityName')),
    postcode: text(descend(trEl, 'PostalAddress', 'PostalZone')),
    subdivision: text(descend(trEl, 'PostalAddress', 'CountrySubentity')),
    country: text(descend(trEl, 'PostalAddress', 'Country', 'IdentificationCode'))!,
    vatId: text(descend(trEl, 'PartyTaxScheme', 'CompanyID'))!,
  } : undefined;

  const deliveryEl = child(root, 'Delivery', CAC);
  const deliveryLocation = child(deliveryEl, 'DeliveryLocation', CAC);
  const locIdEl = child(deliveryLocation, 'ID', CBC);
  const dAddr = child(deliveryLocation, 'Address', CAC);
  const delivery: Delivery | undefined = deliveryEl ? {
    partyName: text(descend(deliveryEl, 'DeliveryParty', 'PartyName', 'Name')),
    locationId: text(locIdEl),
    locationIdScheme: attr(locIdEl, 'schemeID'),
    date: text(child(deliveryEl, 'ActualDeliveryDate', CBC)),
    street: text(child(dAddr, 'StreetName', CBC)),
    street2: text(child(dAddr, 'AdditionalStreetName', CBC)),
    street3: text(descend(dAddr, 'AddressLine', 'Line')),
    city: text(child(dAddr, 'CityName', CBC)),
    postcode: text(child(dAddr, 'PostalZone', CBC)),
    subdivision: text(child(dAddr, 'CountrySubentity', CBC)),
    country: text(descend(dAddr, 'Country', 'IdentificationCode')),
  } : undefined;

  const objectRef = children(root, 'AdditionalDocumentReference', CAC).find((d) => text(child(d, 'DocumentTypeCode', CBC)) === '130');
  const objectIdEl = child(objectRef, 'ID', CBC);
  const attachments: Attachment[] = children(root, 'AdditionalDocumentReference', CAC).filter((d) => d !== objectRef).map((d) => {
    const bin = descend(d, 'Attachment', 'EmbeddedDocumentBinaryObject');
    return {
      id: text(child(d, 'ID', CBC))!,
      description: text(child(d, 'DocumentDescription', CBC)),
      url: text(descend(d, 'Attachment', 'ExternalReference', 'URI')),
      content: text(bin), mimeCode: attr(bin, 'mimeCode'), filename: attr(bin, 'filename'),
    };
  });

  const payeeEl = child(root, 'PayeeParty', CAC);
  const payeeIdEl = descend(payeeEl, 'PartyIdentification', 'ID');
  const payeeLegalId = descend(payeeEl, 'PartyLegalEntity', 'CompanyID');
  const payee: Payee | undefined = payeeEl ? {
    name: text(descend(payeeEl, 'PartyName', 'Name'))!,
    id: text(payeeIdEl), idScheme: attr(payeeIdEl, 'schemeID'),
    legalId: text(payeeLegalId), legalIdScheme: attr(payeeLegalId, 'schemeID'),
  } : undefined;

  const mandate = child(paymentMeansEl, 'PaymentMandate', CAC);
  const cardEl = child(paymentMeansEl, 'CardAccount', CAC);
  const mandateId = text(child(mandate, 'ID', CBC));
  const debitedIban = text(descend(mandate, 'PayerFinancialAccount', 'ID'));
  const creditorId = seller.sepaCreditorId;
  const meansCode = text(child(paymentMeansEl, 'PaymentMeansCode', CBC));
  const sameMeans = paymentMeansAll.slice(1).filter((m) => text(child(m, 'PaymentMeansCode', CBC)) === meansCode);
  const payment: Payment | undefined = paymentMeansEl ? {
    meansCode: text(child(paymentMeansEl, 'PaymentMeansCode', CBC))!,
    meansText: attr(child(paymentMeansEl, 'PaymentMeansCode', CBC), 'name'),
    reference: text(child(paymentMeansEl, 'PaymentID', CBC)),
    iban: text(child(child(paymentMeansEl, 'PayeeFinancialAccount', CAC), 'ID', CBC)),
    accountName: text(child(child(paymentMeansEl, 'PayeeFinancialAccount', CAC), 'Name', CBC)),
    bic: text(descend(child(paymentMeansEl, 'PayeeFinancialAccount', CAC), 'FinancialInstitutionBranch', 'ID')),
    additionalAccounts: arrOrUndefined(sameMeans.map((m) => {
      const a = child(m, 'PayeeFinancialAccount', CAC);
      return { iban: text(child(a, 'ID', CBC))!, accountName: text(child(a, 'Name', CBC)), bic: text(descend(a, 'FinancialInstitutionBranch', 'ID')) };
    })),
    card: cardEl ? { pan: text(child(cardEl, 'PrimaryAccountNumberID', CBC))!, holderName: text(child(cardEl, 'HolderName', CBC)) } : undefined,
    directDebit: mandateId || creditorId || debitedIban ? { mandateId, creditorId, debitedAccountIban: debitedIban } : undefined,
  } : undefined;
  const orderRefEl = child(root, 'OrderReference', CAC);
  const orderId = text(child(orderRefEl, 'ID', CBC));


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
    taxPointDate: text(child(root, 'TaxPointDate', CBC)),
    taxPointDateCode: text(child(periodEl, 'DescriptionCode', CBC)),
    buyerReference: text(child(root, 'BuyerReference', CBC)),
    projectReference: text(descend(root, 'ProjectReference', 'ID')),
    contractReference: text(descend(root, 'ContractDocumentReference', 'ID')),
    orderReference: orderId === 'NA' && text(child(orderRefEl, 'SalesOrderID', CBC)) ? undefined : orderId,
    salesOrderReference: text(child(orderRefEl, 'SalesOrderID', CBC)),
    receivingAdviceReference: text(descend(root, 'ReceiptDocumentReference', 'ID')),
    despatchAdviceReference: text(descend(root, 'DespatchDocumentReference', 'ID')),
    tenderOrLotReference: text(descend(root, 'OriginatorDocumentReference', 'ID')),
    invoicedObjectId: text(objectIdEl),
    invoicedObjectIdScheme: attr(objectIdEl, 'schemeID'),
    buyerAccountingReference: text(child(root, 'AccountingCost', CBC)),
    businessProcess: text(child(root, 'ProfileID', CBC)),
    notes: arrOrUndefined(children(root, 'Note', CBC).map((el) => readNote(text(el)!))),
    paymentTerms: text(descend(root, 'PaymentTerms', 'Note')),
    seller: seller.party,
    buyer: readParty(child(root, 'AccountingCustomerParty', CAC)!).party,
    taxRepresentative,
    delivery,
    periodStart: text(child(periodEl, 'StartDate', CBC)),
    periodEnd: text(child(periodEl, 'EndDate', CBC)),
    precedingInvoices: arrOrUndefined(children(root, 'BillingReference', CAC).map(readPrecedingInvoice)),
    payee,
    payment,
    attachments: arrOrUndefined(attachments),
    lines: dropDefaultLineIds(children(root, credit ? 'CreditNoteLine' : 'InvoiceLine', CAC)
      .map((el) => readLine(el, credit, exemptionGroups))),
    allowances: arrOrUndefined(allowances),
    charges: arrOrUndefined(charges),
    prepaidMinor: prepaidText === undefined ? undefined : parseMoney(prepaidText),
    roundingMinor: roundingText === undefined ? undefined : parseMoney(roundingText),
  };
}
