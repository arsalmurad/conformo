/**
 * Zod schema for the Conformo / EN 16931 Invoice model (packages/core/src/model.ts). The `.describe()` text on every field
 * names its BT/BG identifier and meaning: it becomes the JSON Schema `description`, which is what an AI agent reads.
 *
 * Every object is `.strict()`: an unknown key is an error, never silently dropped. test/schema.test.ts checks that this
 * schema and core's `Invoice` type cannot drift apart. Money is always an integer in minor units (cents).
 */
import { z } from 'zod';

const isoDate = (what: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date, yyyy-mm-dd').describe(`${what} ISO date yyyy-mm-dd.`);
const country = (what: string) =>
  z.string().regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code in capitals, e.g. DE').describe(`${what} ISO 3166-1 alpha-2 country code, e.g. DE, FR.`);
const text = (d: string) => z.string().describe(d);
/** Integer money in minor units (EUR 12.34 = 1234). */
const minor = (d: string) => z.number().int().describe(`${d} Integer in minor units (cents): EUR 12.34 = 1234. Never a decimal.`);

export const taxCategorySchema = z
  .enum(['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M'])
  .describe('UNCL5305 VAT category: S standard, Z zero rated, E exempt, AE reverse charge, K intra-community supply, G export outside EU, O not subject to VAT, L Canary Islands IGIC, M Ceuta/Melilla IPSI.');

export const contactSchema = z.object({
  name: text('BT-41 / BT-56 contact point name.').optional(),
  phone: text('BT-42 / BT-57 contact telephone number.').optional(),
  email: text('BT-43 / BT-58 contact e-mail address.').optional(),
}).strict().describe('BG-6 seller contact / BG-9 buyer contact. XRechnung makes the seller contact mandatory (BR-DE-2).');

export const partySchema = z.object({
  name: text('BT-27 seller name / BT-44 buyer name (legal name).'),
  tradingName: text('BT-28 / BT-45 trading name.').optional(),
  id: text('BT-29 / BT-46 party identifier (first one).').optional(),
  idScheme: text('Scheme identifier of BT-29 / BT-46.').optional(),
  additionalIds: z.array(z.object({
    id: text('Further identifier value.'),
    scheme: text('Scheme of this identifier.').optional(),
  }).strict()).describe('BT-29 / BT-46 can repeat; these are the further identifiers (the first one is `id`).').optional(),
  legalId: text('BT-30 seller / BT-47 buyer legal registration identifier (e.g. SIREN, company number).').optional(),
  legalIdScheme: text('ISO 6523 ICD code for BT-30 / BT-47, e.g. 0002 SIREN, 0009 SIRET, 0208 BE enterprise number. Required when legalId is set.').optional(),
  vatId: text('BT-31 seller / BT-48 buyer VAT identifier including the country prefix, e.g. DE123456789.').optional(),
  taxRegistrationId: text('BT-32, seller only. Tax number where no VAT id exists, e.g. a German Steuernummer. BR-S-02 accepts BT-31, BT-32 or BT-63.').optional(),
  additionalLegalInfo: text('BT-33, seller only. Legal form and capital, e.g. "SARL au capital de 10 000 EUR".').optional(),
  street: text('BT-35 seller / BT-50 buyer address line 1.').optional(),
  street2: text('BT-36 / BT-51 address line 2.').optional(),
  street3: text('BT-162 / BT-163 address line 3.').optional(),
  city: text('BT-37 / BT-52 city.').optional(),
  postcode: text('BT-38 / BT-53 post code.').optional(),
  subdivision: text('BT-39 / BT-54 country subdivision (state, region).').optional(),
  country: country('BT-40 seller / BT-55 buyer country.'),
  electronicAddress: text('BT-34 seller / BT-49 buyer electronic address. Optional in EN 16931, MANDATORY in France, Peppol and XRechnung.').optional(),
  electronicAddressScheme: text('EAS code of the electronic address, e.g. EM (e-mail), 0088 GLN, 0204 Leitweg-ID, 0208 BE enterprise number, 9925 BE VAT. Defaults to EM only for a value containing "@".').optional(),
  contact: contactSchema.optional(),
}).strict().describe('BG-4 seller / BG-7 buyer, with address BG-5 / BG-8. Only the name and country are mandatory in EN 16931; CIUS rules (XRechnung, Peppol, France) add more.');

export const taxRepresentativeSchema = z.object({
  name: text('BT-62 seller tax representative name.'),
  vatId: text('BT-63 seller tax representative VAT identifier.'),
  street: text('BT-64 address line 1.').optional(),
  street2: text('BT-65 address line 2.').optional(),
  street3: text('BT-164 address line 3.').optional(),
  city: text('BT-66 city.').optional(),
  postcode: text('BT-67 post code.').optional(),
  subdivision: text('BT-68 country subdivision.').optional(),
  country: country('BT-69 tax representative country.'),
}).strict().describe('BG-11 seller tax representative party, with its address BG-12.');

export const lineAllowanceChargeSchema = z.object({
  amountMinor: minor('BT-136 line allowance / BT-141 line charge amount, always positive.'),
  baseAmountMinor: minor('BT-137 / BT-142 base amount the percentage applies to.').optional(),
  percent: z.number().describe('BT-138 / BT-143 percentage (e.g. 10 for 10 %).').optional(),
  reason: text('BT-139 / BT-144 reason text.').optional(),
  reasonCode: text('BT-140 / BT-145 reason code, UNTDID 5189 (allowance) or 7161 (charge).').optional(),
}).strict().describe('BG-27 line level allowance (a discount) or BG-28 line level charge. Same shape, different array.');

export const itemClassificationSchema = z.object({
  code: text('BT-158 item classification identifier.'),
  scheme: text('BT-158-1 list identifier, e.g. STI, CPV, UNSPSC.'),
  schemeVersion: text('BT-158-2 list version identifier.').optional(),
}).strict().describe('BT-158 item classification identifier with its list and version.');

export const itemAttributeSchema = z.object({
  name: text('BT-160 item attribute name.'),
  value: text('BT-161 item attribute value.'),
}).strict().describe('BG-32 item attribute.');

export const lineSchema = z.object({
  id: text('BT-126 invoice line identifier. Defaults to the 1-based position when absent.').optional(),
  note: text('BT-127 invoice line note.').optional(),
  objectId: text('BT-128 invoice line object identifier.').optional(),
  objectIdScheme: text('BT-128-1 scheme identifier of the line object identifier.').optional(),
  orderLineReference: text('BT-132 referenced purchase order line reference.').optional(),
  buyerAccountingReference: text('BT-133 invoice line buyer accounting reference.').optional(),
  periodStart: isoDate('BT-134 invoice line period start date (BG-26).').optional(),
  periodEnd: isoDate('BT-135 invoice line period end date (BG-26).').optional(),
  name: text('BT-153 item name.'),
  description: text('BT-154 item description.').optional(),
  sellerAssignedId: text('BT-155 item seller identifier.').optional(),
  buyerAssignedId: text('BT-156 item buyer identifier.').optional(),
  standardItemId: text('BT-157 item standard identifier, e.g. a GTIN. Needs standardItemIdScheme.').optional(),
  standardItemIdScheme: text('BT-157-1 scheme of the standard item identifier, e.g. 0160 for GTIN.').optional(),
  classifications: z.array(itemClassificationSchema).describe('BT-158 item classification identifiers.').optional(),
  originCountry: country('BT-159 item country of origin.').optional(),
  attributes: z.array(itemAttributeSchema).describe('BG-32 item attributes.').optional(),
  quantity: z.number().describe('BT-129 invoiced quantity, a decimal number (negative on a credit-note line is allowed). Read exactly, never as a binary float.'),
  netAmountMinor: minor('BT-131 line net amount as stated in a document. Normally leave it UNSET: the net amount is computed from quantity, price and line allowances/charges. Set only to reproduce a document that states another value.').optional(),
  unitPriceMinor: z.number().describe('BT-146 item NET price per unit in minor units. May be fractional (1.25 = 0.0125 in a two-decimal currency) because EN 16931 allows unit prices with more decimals than the currency.'),
  priceDiscountMinor: z.number().describe('BT-147 item price discount in minor units (informational: BT-146 is already net).').optional(),
  grossPriceMinor: z.number().describe('BT-148 item gross price in minor units. When set together with BT-147, BT-146 must equal BT-148 - BT-147.').optional(),
  priceBaseQuantity: z.number().describe('BT-149 item price base quantity (default 1).').optional(),
  priceBaseUnitCode: text('BT-150 item price base quantity unit of measure code.').optional(),
  unitCode: text('BT-130 invoiced quantity unit of measure, UN/ECE Recommendation 20. C62 = piece, HUR = hour, DAY = day, KGM = kilogram.').optional(),
  allowances: z.array(lineAllowanceChargeSchema).describe('BG-27 invoice line allowances.').optional(),
  charges: z.array(lineAllowanceChargeSchema).describe('BG-28 invoice line charges.').optional(),
  taxCategory: taxCategorySchema.describe('BT-151 invoiced item VAT category code (S, Z, E, AE, K, G, O, L, M).'),
  taxRate: z.number().describe('BT-152 invoiced item VAT rate in percent (19 for 19 %). Ignored for category O: BR-O-05 forbids a rate on a line "not subject to VAT". Use 0 for Z, E, AE, K, G, O.'),
  exemptionReason: text('BT-120 VAT exemption reason text (for categories E, AE, K, G, O).').optional(),
  exemptionCode: text('BT-121 VAT exemption reason code, VATEX code list, e.g. VATEX-EU-AE.').optional(),
}).strict().describe('BG-25 invoice line (with BG-29 price details, BG-30 line VAT information, BG-31 item information).');

export const noteSchema = z.object({
  text: text('BT-22 invoice note text.'),
  subjectCode: text('BT-21 invoice note subject code. France requires AAB, PMD and PMT on every invoice.').optional(),
}).strict().describe('BG-1 invoice note.');

export const creditTransferSchema = z.object({
  iban: text('BT-84 payment account identifier (IBAN).'),
  accountName: text('BT-85 payment account name.').optional(),
  bic: text('BT-86 payment service provider identifier (BIC).').optional(),
}).strict().describe('BG-17 credit transfer account.');

export const paymentSchema = z.object({
  meansCode: text('BT-81 payment means type code, UNTDID 4461. 58 = SEPA credit transfer, 59 = SEPA direct debit, 30 = credit transfer, 48 = bank card.'),
  meansText: text('BT-82 payment means text.').optional(),
  reference: text('BT-83 remittance information: what the payer must quote on the transfer.').optional(),
  iban: text('BT-84 payment account identifier (IBAN) of the first account.').optional(),
  accountName: text('BT-85 payment account name.').optional(),
  bic: text('BT-86 payment service provider identifier (BIC).').optional(),
  additionalAccounts: z.array(creditTransferSchema).describe('BG-17 can repeat: further accounts the buyer may pay into (the first one is iban/accountName/bic).').optional(),
  card: z.object({
    pan: text('BT-87 payment card primary account number: the LAST 4-6 DIGITS ONLY.'),
    holderName: text('BT-88 payment card holder name.').optional(),
  }).strict().describe('BG-18 payment card information.').optional(),
  directDebit: z.object({
    mandateId: text('BT-89 mandate reference identifier.').optional(),
    creditorId: text("BT-90 bank assigned creditor identifier (the seller's SEPA Glaeubiger-ID).").optional(),
    debitedAccountIban: text('BT-91 debited account identifier (IBAN).').optional(),
  }).strict().describe('BG-19 direct debit (SEPA Lastschrift, meansCode 59).').optional(),
}).strict().describe('BG-16 payment instructions.');

export const allowanceChargeSchema = z.object({
  amountMinor: minor('BT-92 document allowance / BT-99 document charge amount, always positive.'),
  baseAmountMinor: minor('BT-93 / BT-100 base amount the percentage applies to.').optional(),
  percent: z.number().describe('BT-94 / BT-101 percentage (e.g. 10 for 10 %).').optional(),
  reason: text('BT-97 / BT-104 reason text.').optional(),
  reasonCode: text('BT-98 / BT-105 reason code, UNTDID 5189 (allowance) or 7161 (charge).').optional(),
  taxCategory: taxCategorySchema.describe('BT-95 / BT-102 VAT category code of the allowance or charge.'),
  taxRate: z.number().describe('BT-96 / BT-103 VAT rate in percent of the allowance or charge.'),
  exemptionCode: text('Only needed to pick a breakdown when several share this category and rate but differ in exemption (VATEX code, BT-121).').optional(),
  exemptionReason: text('Only needed to pick a breakdown when several share this category and rate but differ in exemption (BT-120).').optional(),
}).strict().describe('BG-20 document level allowance (a discount) or BG-21 document level charge. Same shape, different array.');

export const precedingInvoiceSchema = z.object({
  number: text('BT-25 preceding invoice reference.'),
  issueDate: isoDate('BT-26 preceding invoice issue date.').optional(),
}).strict().describe('BG-3 preceding invoice reference. Needed in practice for credit notes (type 381).');

export const deliverySchema = z.object({
  partyName: text('BT-70 deliver-to party name.').optional(),
  locationId: text('BT-71 deliver-to location identifier.').optional(),
  locationIdScheme: text('BT-71-1 scheme of the location identifier.').optional(),
  date: isoDate('BT-72 actual delivery date.').optional(),
  street: text('BT-75 deliver-to address line 1.').optional(),
  street2: text('BT-76 address line 2.').optional(),
  street3: text('BT-165 address line 3.').optional(),
  city: text('BT-77 deliver-to city.').optional(),
  postcode: text('BT-78 deliver-to post code.').optional(),
  subdivision: text('BT-79 deliver-to country subdivision.').optional(),
  country: country('BT-80 deliver-to country.').optional(),
}).strict().describe('BG-13 delivery information with BG-15 deliver-to address.');

export const payeeSchema = z.object({
  name: text('BT-59 payee name.'),
  id: text('BT-60 payee identifier.').optional(),
  idScheme: text('BT-60-1 scheme of the payee identifier.').optional(),
  legalId: text('BT-61 payee legal registration identifier.').optional(),
  legalIdScheme: text('BT-61-1 scheme of the payee legal registration identifier.').optional(),
}).strict().describe('BG-10 payee, when the party paid is not the seller.');

export const attachmentSchema = z.object({
  id: text('BT-122 supporting document reference.'),
  description: text('BT-123 supporting document description.').optional(),
  url: text('BT-124 external document location (URL). Use this OR `content`.').optional(),
  content: text('BT-125 attached document, base64-encoded. Together with mimeCode and filename it is embedded.').optional(),
  mimeCode: text('BT-125-1 attached document MIME code, e.g. application/pdf.').optional(),
  filename: text('BT-125-2 attached document filename.').optional(),
}).strict().describe('BG-24 additional supporting document: an attachment or a link.');

export const invoiceSchema = z.object({
  number: text('BT-1 invoice number.'),
  typeCode: text('BT-3 invoice type code, UNTDID 1001. Default 380 (commercial invoice). 381 credit note, 384 corrected invoice, 389 self-billed invoice, 326 partial invoice, 875/876/877 partial/construction invoices. Credit-note codes are written as a UBL CreditNote.').optional(),
  issueDate: isoDate('BT-2 invoice issue date.'),
  taxPointDate: isoDate('BT-7 value added tax point date. Use this OR taxPointDateCode.').optional(),
  taxPointDateCode: text('BT-8 value added tax point date code, UNTDID 2005: 3 invoice date, 35 delivery date, 432 paid-to-date.').optional(),
  dueDate: isoDate('BT-9 payment due date.').optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code in capitals, e.g. EUR').describe('BT-5 invoice currency code, ISO 4217, e.g. EUR.'),
  taxCurrency: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code in capitals').describe('BT-6 VAT accounting currency, when it differs from BT-5. Then taxTotalInTaxCurrencyMinor (BT-111) is mandatory (BR-53).').optional(),
  taxTotalInTaxCurrencyMinor: minor('BT-111 invoice total VAT amount in the accounting currency. Needs an exchange rate, so the caller supplies it.').optional(),
  buyerReference: text('BT-10 buyer reference. For German public-sector invoices this is the Leitweg-ID (BR-DE-15).').optional(),
  projectReference: text('BT-11 project reference.').optional(),
  contractReference: text('BT-12 contract reference.').optional(),
  orderReference: text('BT-13 purchase order reference. Peppol needs BT-10 or BT-13 (PEPPOL-EN16931-R003).').optional(),
  salesOrderReference: text('BT-14 sales order reference.').optional(),
  receivingAdviceReference: text('BT-15 receiving advice reference.').optional(),
  despatchAdviceReference: text('BT-16 despatch advice reference.').optional(),
  tenderOrLotReference: text('BT-17 tender or lot reference.').optional(),
  invoicedObjectId: text('BT-18 invoiced object identifier (e.g. a meter or asset number).').optional(),
  invoicedObjectIdScheme: text('BT-18-1 scheme identifier of the invoiced object identifier.').optional(),
  buyerAccountingReference: text('BT-19 buyer accounting reference.').optional(),
  businessProcess: text('BT-23 business process type. A plain string on purpose: France wants a closed list (B1, S1, M1, ...), Peppol and XRechnung want a profile URN. Each format decides what it accepts.').optional(),
  notes: z.array(noteSchema).describe('BG-1 invoice notes.').optional(),
  paymentTerms: text('BT-20 payment terms text. XRechnung uses a structured #SKONTO# syntax here for early-payment discounts.').optional(),
  seller: partySchema.describe('BG-4 seller (with BG-5 postal address and BG-6 contact).'),
  buyer: partySchema.describe('BG-7 buyer (with BG-8 postal address and BG-9 contact).'),
  taxRepresentative: taxRepresentativeSchema.optional(),
  delivery: deliverySchema.optional(),
  payee: payeeSchema.optional(),
  periodStart: isoDate('BT-73 invoicing period start date (BG-14).').optional(),
  periodEnd: isoDate('BT-74 invoicing period end date (BG-14).').optional(),
  precedingInvoices: z.array(precedingInvoiceSchema).describe('BG-3 preceding invoice references.').optional(),
  payment: paymentSchema.optional(),
  attachments: z.array(attachmentSchema).describe('BG-24 additional supporting documents, any number.').optional(),
  lines: z.array(lineSchema).describe('BG-25 invoice lines. At least one is required (BR-16).'),
  allowances: z.array(allowanceChargeSchema).describe('BG-20 document level allowances.').optional(),
  charges: z.array(allowanceChargeSchema).describe('BG-21 document level charges.').optional(),
  statedVatAmounts: z.array(z.object({
    category: taxCategorySchema.describe('BT-118 VAT category of the breakdown this stated amount belongs to.'),
    rate: z.number().describe('BT-119 VAT rate in percent of that breakdown.'),
    amountMinor: minor('BT-117 VAT category tax amount as stated in a source document.'),
    exemptionCode: text('BT-121 exemption code, to pick the breakdown when several share category and rate.').optional(),
    exemptionReason: text('BT-120 exemption reason, to pick the breakdown when several share category and rate.').optional(),
  }).strict()).describe('BT-117 per VAT breakdown (BG-23) as stated in a document. Normally leave unset: VAT amounts are computed. Set only to reproduce a source document\'s stated value; it is honoured only within one minor unit of the computed amount.').optional(),
  prepaidMinor: minor('BT-113 paid amount (prepayment already received).').optional(),
  roundingMinor: minor('BT-114 rounding amount, added to the amount due (BR-CO-16). May be negative.').optional(),
}).strict().describe('An EN 16931 invoice (the Conformo model). Totals (BT-106..BT-115) and the VAT breakdown (BG-23) are NOT input: they are computed from the lines, allowances and charges. All money is integer minor units.');

export type InvoiceInput = z.infer<typeof invoiceSchema>;
