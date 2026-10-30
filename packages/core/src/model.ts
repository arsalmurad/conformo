/**
 * The EN 16931 semantic model. Every output format is a serializer over this
 * one shape. BT/BG identifiers are in the comments deliberately: when a
 * validator reports "BR-CO-15", you need to find the field without guessing.
 *
 * Nothing here is specific to one syntax or one country. A field exists because
 * EN 16931 defines it as a business term. Whether a given CIUS (XRechnung, Peppol,
 * BR-FR) makes it mandatory is the serializer's and the validator's business.
 */
import type { Minor } from './money.js';

export type TaxCategory = 'S' | 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O' | 'L' | 'M';
/**
 * BT-3, UNTDID 1001 invoice and credit-note codes (EN 16931 BR-CL-01). Common values are listed for
 * completion; any code on the official list is accepted and checkInvoice() warns about codes that are not.
 * Credit-note codes (381, 396, 81, 83, ...) are serialized as a UBL CreditNote.
 */
export type DocumentTypeCode =
  | '380' | '381' | '384' | '389' | '386' | '326' | '875' | '876' | '877'
  | '71' | '80' | '81' | '82' | '83' | '84' | '383' | '393' | '396' | '532' | '751' | '780' | '935'
  | (string & {});

/** Codes that make a UBL document a CreditNote rather than an Invoice (UNCL1001 credit-note subset used by EN 16931). */
export const CREDIT_NOTE_TYPE_CODES: readonly string[] = ['81', '83', '261', '262', '296', '308', '381', '396', '420', '458', '532'];

/** BG-6 seller contact / BG-9 buyer contact. XRechnung makes BG-6 mandatory (BR-DE-2). */
export interface Contact {
  name?: string;                   // BT-41 / BT-56
  phone?: string;                  // BT-42 / BT-57
  email?: string;                  // BT-43 / BT-58
}

export interface Party {
  name: string;                    // BT-27 / BT-44
  tradingName?: string;            // BT-28 / BT-45
  id?: string;                     // BT-29 / BT-46
  idScheme?: string;               // scheme identifier of BT-29 / BT-46
  /** BT-29 / BT-46 can repeat. These are the further identifiers (the first one is `id`). */
  additionalIds?: { id: string; scheme?: string }[];
  legalId?: string;                // BT-30 / BT-47
  /** ISO 6523 ICD code for BT-30 / BT-47, e.g. 0002 SIREN, 0009 SIRET, 0208 BE enterprise no. Required when legalId is set. */
  legalIdScheme?: string;
  vatId?: string;                  // BT-31 / BT-48
  /** BT-32, seller only. Tax number where no VAT id exists, e.g. a German Steuernummer. BR-S-02 accepts BT-31, BT-32 or BT-63. */
  taxRegistrationId?: string;
  /** BT-33, seller only. Legal form and capital, e.g. "SARL au capital de 10 000 EUR". */
  additionalLegalInfo?: string;
  /** Only the country is mandatory in EN 16931 (BR-9, BR-11). CIUS rules add the rest. */
  street?: string;                 // BT-35 / BT-50
  street2?: string;                // BT-36 / BT-51
  street3?: string;                // BT-162 / BT-163
  city?: string;                   // BT-37 / BT-52
  postcode?: string;               // BT-38 / BT-53
  subdivision?: string;            // BT-39 / BT-54
  country: string;                 // BT-40 / BT-55, ISO 3166-1 alpha-2
  /** BT-34 seller / BT-49 buyer. Optional in EN 16931, MANDATORY in France, Peppol and XRechnung. */
  electronicAddress?: string;
  /** EAS code, e.g. EM (e-mail), 0088 GLN, 0204 Leitweg-ID, 0208 BE enterprise no., 9925 BE VAT. Defaults to EM only for a value containing "@". */
  electronicAddressScheme?: string;
  contact?: Contact;               // BG-6 / BG-9
}

/** BG-11 seller tax representative, with its address BG-12. */
export interface TaxRepresentative {
  name: string;                    // BT-62
  vatId: string;                   // BT-63
  street?: string;                 // BT-64
  street2?: string;                // BT-65
  street3?: string;                // BT-164
  city?: string;                   // BT-66
  postcode?: string;               // BT-67
  subdivision?: string;            // BT-68
  country: string;                 // BT-69
}

/** BG-27 line level allowance (BG-28 charge): same shape, different array. */
export interface LineAllowanceCharge {
  amountMinor: Minor;              // BT-136 / BT-141, always positive
  baseAmountMinor?: Minor;         // BT-137 / BT-142
  percent?: number;                // BT-138 / BT-143
  reason?: string;                 // BT-139 / BT-144
  reasonCode?: string;             // BT-140 / BT-145, UNTDID 5189 (allowance) or 7161 (charge)
}

/** BT-158 item classification identifier with its list (BT-158-1) and version (BT-158-2). */
export interface ItemClassification {
  code: string;                    // BT-158
  scheme: string;                  // BT-158-1, e.g. STI, CPV, UNSPSC
  schemeVersion?: string;          // BT-158-2
}

/** BG-32 item attribute. */
export interface ItemAttribute {
  name: string;                    // BT-160
  value: string;                   // BT-161
}

export interface Line {
  /** BT-126. Defaults to the 1-based position when absent. */
  id?: string;
  note?: string;                   // BT-127
  /** BT-128 invoiced object identifier on the line, with scheme BT-128-1. */
  objectId?: string;
  objectIdScheme?: string;
  /** BT-132 referenced purchase order line. */
  orderLineReference?: string;
  /** BT-133 line buyer accounting reference. */
  buyerAccountingReference?: string;
  /** BG-26 line invoicing period. */
  periodStart?: string;            // BT-134
  periodEnd?: string;              // BT-135
  name: string;                    // BT-153
  description?: string;            // BT-154
  sellerAssignedId?: string;       // BT-155
  buyerAssignedId?: string;        // BT-156
  /** BT-157, e.g. a GTIN. Needs standardItemIdScheme (BT-157-1), e.g. 0160. */
  standardItemId?: string;
  standardItemIdScheme?: string;
  classifications?: ItemClassification[]; // BT-158
  originCountry?: string;          // BT-159, ISO 3166-1 alpha-2
  attributes?: ItemAttribute[];    // BG-32
  quantity: number;                // BT-129. Decimal: read exactly, never as a binary float.
  /**
   * BT-131 as stated in a document. Normally leave it unset: the net amount is computed from quantity, price and the
   * line allowances/charges. EN 16931 has no rule tying BT-131 to those, so a real document can state another value
   * (the official UBL example 1 does, with a negative line); the reader sets this only when the stated value differs
   * from the computed one, so that converting such a document reproduces its totals.
   */
  netAmountMinor?: Minor;
  /**
   * BT-146 item NET price in minor units. May be fractional (1.25 = 0.0125 in a two-decimal currency)
   * because EN 16931 allows unit prices with more decimals than the currency; arithmetic stays exact.
   */
  unitPriceMinor: Minor;
  /** BT-147 item price discount (only informational: BT-146 is already net). */
  priceDiscountMinor?: Minor;
  /** BT-148 item gross price. When set together with BT-147, BT-146 must equal BT-148 - BT-147. */
  grossPriceMinor?: Minor;
  /** BT-149 item price base quantity (default 1) and BT-150 its unit code. */
  priceBaseQuantity?: number;
  priceBaseUnitCode?: string;
  unitCode?: string;               // BT-130, UN/ECE Rec 20. C62 = piece, HUR = hour
  allowances?: LineAllowanceCharge[]; // BG-27
  charges?: LineAllowanceCharge[];    // BG-28
  taxCategory: TaxCategory;        // BT-151
  /** BT-152. Ignored for category O: BR-O-05 forbids a rate on a line "not subject to VAT". */
  taxRate: number;
  exemptionReason?: string;        // BT-120
  exemptionCode?: string;          // BT-121, VATEX code list
}

export interface Note {
  text: string;                    // BT-22
  /** BT-21 subject code. France requires AAB, PMD and PMT on every invoice. */
  subjectCode?: string;
}

/** BG-17 a credit transfer account. */
export interface CreditTransfer {
  iban: string;                    // BT-84, payment account identifier
  accountName?: string;            // BT-85
  bic?: string;                    // BT-86
}

export interface Payment {
  meansCode: string;               // BT-81, UNTDID 4461. 58 = SEPA credit transfer, 59 = SEPA direct debit
  meansText?: string;              // BT-82
  /** BT-83 remittance information: what the payer must quote on the transfer. */
  reference?: string;
  iban?: string;                   // BT-84
  accountName?: string;            // BT-85
  bic?: string;                    // BT-86
  /** BG-17 can repeat: further accounts the buyer may pay into (the first one is iban/accountName/bic). */
  additionalAccounts?: CreditTransfer[];
  /** BG-18 payment card information. */
  card?: { pan: string; holderName?: string }; // BT-87 (last 4-6 digits only), BT-88
  /** BG-19 direct debit. Common in Germany: SEPA Lastschrift, meansCode 59. */
  directDebit?: {
    mandateId?: string;            // BT-89 mandate reference identifier
    creditorId?: string;           // BT-90 bank assigned creditor identifier (the seller's SEPA Gläubiger-ID)
    debitedAccountIban?: string;   // BT-91 debited account identifier
  };
}

/** BG-20 document level allowance (a discount) or BG-21 charge. Same shape, different array. */
export interface AllowanceCharge {
  amountMinor: Minor;              // BT-92 / BT-99, always positive
  baseAmountMinor?: Minor;         // BT-93 / BT-100
  percent?: number;                // BT-94 / BT-101
  reason?: string;                 // BT-97 / BT-104
  reasonCode?: string;             // BT-98 / BT-105, UNTDID 5189 (allowance) or 7161 (charge)
  taxCategory: TaxCategory;        // BT-95 / BT-102
  taxRate: number;                 // BT-96 / BT-103
  /** Only needed to pick a breakdown when several share this category and rate but differ in exemption. */
  exemptionCode?: string;
  exemptionReason?: string;
}

/** BG-3 preceding invoice reference. Needed in practice for credit notes (type 381). */
export interface PrecedingInvoice {
  number: string;                  // BT-25
  issueDate?: string;              // BT-26
}

/** BG-13 delivery information with BG-15 delivery address. */
export interface Delivery {
  partyName?: string;              // BT-70
  locationId?: string;             // BT-71
  locationIdScheme?: string;       // BT-71-1
  date?: string;                   // BT-72, ISO yyyy-mm-dd
  street?: string;                 // BT-75
  street2?: string;                // BT-76
  street3?: string;                // BT-165
  city?: string;                   // BT-77
  postcode?: string;               // BT-78
  subdivision?: string;            // BT-79
  country?: string;                // BT-80
}

/** BG-10 payee, when the party paid is not the seller. */
export interface Payee {
  name: string;                    // BT-59
  id?: string;                     // BT-60
  idScheme?: string;               // BT-60-1
  legalId?: string;                // BT-61
  legalIdScheme?: string;          // BT-61-1
}

/** BG-24 additional supporting document: an attachment or a link. */
export interface Attachment {
  id: string;                      // BT-122 supporting document reference
  description?: string;            // BT-123
  /** BT-124 external document location. Use this OR `content`. */
  url?: string;
  /** BT-125 attached document, base64. With mimeCode (BT-125-1) and filename (BT-125-2) it is embedded. */
  content?: string;
  mimeCode?: string;
  filename?: string;
}

export interface Invoice {
  number: string;                  // BT-1
  typeCode?: DocumentTypeCode;     // BT-3, default 380
  issueDate: string;               // BT-2, ISO yyyy-mm-dd
  /** BT-7 value added tax point date and BT-8 its code (UNTDID 2005: 3 invoice date, 35 delivery date, 432 paid-to-date). Use one of them. */
  taxPointDate?: string;           // BT-7
  taxPointDateCode?: string;       // BT-8
  dueDate?: string;                // BT-9
  currency: string;                // BT-5
  /** BT-6 VAT accounting currency, when it differs from BT-5. Then BT-111 is mandatory (BR-53). */
  taxCurrency?: string;
  /** BT-111. Needs an exchange rate, so the caller supplies it; it cannot be derived here. */
  taxTotalInTaxCurrencyMinor?: Minor;
  /** BT-10. For German public-sector invoices this is the Leitweg-ID (BR-DE-15). */
  buyerReference?: string;
  projectReference?: string;       // BT-11
  contractReference?: string;      // BT-12
  orderReference?: string;         // BT-13. Peppol needs BT-10 or BT-13 (PEPPOL-EN16931-R003).
  salesOrderReference?: string;    // BT-14
  receivingAdviceReference?: string; // BT-15
  despatchAdviceReference?: string;  // BT-16
  tenderOrLotReference?: string;   // BT-17
  /** BT-18 invoiced object identifier and BT-18-1 its scheme (e.g. a meter or asset number). */
  invoicedObjectId?: string;
  invoicedObjectIdScheme?: string;
  buyerAccountingReference?: string; // BT-19
  /**
   * BT-23. A plain string on purpose: France wants a closed list (B1, S1, M1, ...),
   * Peppol and XRechnung want a profile URN. Each format decides what it accepts.
   */
  businessProcess?: string;
  notes?: Note[];
  paymentTerms?: string;           // BT-20
  seller: Party;
  buyer: Party;
  taxRepresentative?: TaxRepresentative; // BG-11
  delivery?: Delivery;             // BG-13
  payee?: Payee;                   // BG-10
  periodStart?: string;            // BT-73, BG-14 invoicing period
  periodEnd?: string;              // BT-74
  precedingInvoices?: PrecedingInvoice[]; // BG-3
  /** BG-16. Optional in EN 16931; XRechnung (BR-DE-1) and most payers need it. */
  payment?: Payment;
  /** BG-24, any number. */
  attachments?: Attachment[];
  lines: Line[];
  allowances?: AllowanceCharge[];  // BG-20
  charges?: AllowanceCharge[];     // BG-21
  prepaidMinor?: Minor;            // BT-113
  /** BT-114. Added to the amount due (BR-CO-16). */
  roundingMinor?: Minor;
}

export interface TaxGroup {
  category: TaxCategory;           // BT-118
  rate: number;                    // BT-119. Held as 0 for category O, where none is serialized.
  basis: Minor;                    // BT-116
  amount: Minor;                   // BT-117
  exemptionReason?: string;        // BT-120
  exemptionCode?: string;          // BT-121
}

export interface Totals {
  groups: TaxGroup[];              // BG-23
  lineTotal: Minor;   // BT-106
  allowance: Minor;   // BT-107
  charge: Minor;      // BT-108
  taxBasis: Minor;    // BT-109
  taxTotal: Minor;    // BT-110
  grand: Minor;       // BT-112
  prepaid: Minor;     // BT-113
  rounding: Minor;    // BT-114
  due: Minor;         // BT-115
}
