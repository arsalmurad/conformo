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
/** UNTDID 1001 subset. 381 is a credit note (serialized as a UBL CreditNote). */
export type DocumentTypeCode = '380' | '381' | '384' | '389' | '386' | '326' | '875' | '876' | '877';

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
  city?: string;                   // BT-66
  postcode?: string;               // BT-67
  subdivision?: string;            // BT-68
  country: string;                 // BT-69
}

export interface Line {
  name: string;                    // BT-153
  description?: string;            // BT-154
  sellerAssignedId?: string;       // BT-155
  buyerAssignedId?: string;        // BT-156
  /** BT-157, e.g. a GTIN. Needs standardItemIdScheme (BT-157-1), e.g. 0160. */
  standardItemId?: string;
  standardItemIdScheme?: string;
  originCountry?: string;          // BT-159, ISO 3166-1 alpha-2
  quantity: number;                // BT-129. Decimal: read exactly, never as a binary float.
  unitPriceMinor: Minor;           // BT-146
  unitCode?: string;               // BT-130, UN/ECE Rec 20. C62 = piece, HUR = hour
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

export interface Payment {
  meansCode: string;               // BT-81, UNTDID 4461. 58 = SEPA credit transfer
  meansText?: string;              // BT-82
  /** BT-83 remittance information: what the payer must quote on the transfer. */
  reference?: string;
  iban?: string;                   // BT-84
  accountName?: string;            // BT-85
  bic?: string;                    // BT-86
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
  date?: string;                   // BT-72, ISO yyyy-mm-dd
  street?: string;                 // BT-75
  city?: string;                   // BT-77
  postcode?: string;               // BT-78
  country?: string;                // BT-80
}

export interface Invoice {
  number: string;                  // BT-1
  typeCode?: DocumentTypeCode;     // BT-3, default 380
  issueDate: string;               // BT-2, ISO yyyy-mm-dd
  dueDate?: string;                // BT-9
  currency: string;                // BT-5
  /** BT-6 VAT accounting currency, when it differs from BT-5. Then BT-111 is mandatory (BR-53). */
  taxCurrency?: string;
  /** BT-111. Needs an exchange rate, so the caller supplies it; it cannot be derived here. */
  taxTotalInTaxCurrencyMinor?: Minor;
  /** BT-10. For German public-sector invoices this is the Leitweg-ID (BR-DE-15). */
  buyerReference?: string;
  contractReference?: string;      // BT-12
  orderReference?: string;         // BT-13. Peppol needs BT-10 or BT-13 (PEPPOL-EN16931-R003).
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
  periodStart?: string;            // BT-73, BG-14 invoicing period
  periodEnd?: string;              // BT-74
  precedingInvoices?: PrecedingInvoice[]; // BG-3
  payment: Payment;
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
