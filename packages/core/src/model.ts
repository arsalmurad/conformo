/**
 * The EN 16931 semantic model. Every output format is a serializer over this
 * one shape. BT/BG identifiers are in the comments deliberately: when a
 * validator reports "BR-CO-15", you need to find the field without guessing.
 */
import type { Minor } from './money.js';

export type TaxCategory = 'S' | 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O' | 'L' | 'M';
export type DocumentTypeCode = '380' | '381' | '384' | '389' | '386';

export interface Party {
  name: string;                    // BT-27 / BT-44
  id?: string;                     // BT-29 / BT-46
  legalId?: string;                // BT-30 / BT-47
  legalIdScheme?: string;          // ICD scheme, e.g. 0002 SIREN, 0198 DE
  vatId?: string;                  // BT-31 / BT-48
  street: string;                  // BT-35 / BT-50
  city: string;                    // BT-37 / BT-52
  postcode: string;                // BT-38 / BT-53
  country: string;                 // BT-40 / BT-55, ISO 3166-1 alpha-2
  /** BT-34 seller / BT-49 buyer. Optional in EN 16931, MANDATORY in France. */
  electronicAddress?: string;
  electronicAddressScheme?: string;
}

export interface Line {
  name: string;                    // BT-153
  description?: string;            // BT-154
  sellerAssignedId?: string;       // BT-155
  quantity: number;                // BT-129
  unitPriceMinor: Minor;           // BT-146
  unitCode?: string;               // BT-130, UN/ECE Rec 20. C62 = piece, HUR = hour
  taxCategory: TaxCategory;        // BT-151
  taxRate: number;                 // BT-152
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
  iban?: string;                   // BT-84
  bic?: string;                    // BT-86
}

export interface Invoice {
  number: string;                  // BT-1
  typeCode?: DocumentTypeCode;     // BT-3, default 380
  issueDate: string;               // BT-2, ISO yyyy-mm-dd
  dueDate?: string;                // BT-9
  currency: string;                // BT-5
  buyerReference?: string;         // BT-10
  /** BT-23. Mandatory in France, from a closed list: B1 S1 M1 B2 S2 M2 ... */
  businessProcess?: string;
  notes?: Note[];
  paymentTerms?: string;           // BT-20
  seller: Party;
  buyer: Party;
  payment: Payment;
  lines: Line[];
  allowanceTotalMinor?: Minor;     // BT-107
  chargeTotalMinor?: Minor;        // BT-108
  prepaidMinor?: Minor;            // BT-113
}

export interface TaxGroup {
  category: TaxCategory;
  rate: number;
  basis: Minor;
  amount: Minor;
  exemptionReason?: string;
  exemptionCode?: string;
}

export interface Totals {
  groups: TaxGroup[];
  lineTotal: Minor;   // BT-106
  allowance: Minor;   // BT-107
  charge: Minor;      // BT-108
  taxBasis: Minor;    // BT-109
  taxTotal: Minor;    // BT-110
  grand: Minor;       // BT-112
  prepaid: Minor;     // BT-113
  due: Minor;         // BT-115
}
