import type { PlainLanguageMessage } from "../types.js";

/**
 * Plain-language translations of the official Schematron rule text, for the
 * ~40 rules a real invoice is most likely to hit: the mandatory-field rules
 * every invoice must pass (BR-01..BR-16), the total/tax arithmetic that a
 * hand-rolled invoice generator gets wrong first (BR-CO-*), the VAT-category
 * rules that are the leading source of confusion (BR-S/Z/E/AE/IC-*), and the
 * French CTC rules this repo's own sample invoice failed against in an earlier pass
 * (see docs/pdf-traps.md).
 *
 * This ranking is curated, not measured: we have no field telemetry on real
 * failure rates (see the project's own tracker open questions), so it is built from
 * which rules are (a) most load-bearing — every invoice must satisfy BR-01
 * to BR-16 and the totals rules — and (b) most often gotten wrong in
 * practice per the traps this project has already hit and documented.
 *
 * This file is data, not logic, specifically so it can grow a `fr.ts`,
 * `de.ts`, etc. beside it without touching src/messages/index.ts or any
 * caller — see getPlainLanguageMessage.
 */
export const en: Record<string, PlainLanguageMessage> = {
  // --- Mandatory fields (BR-01..BR-16): an invoice missing any of these
  // isn't incomplete, it's not a valid EN 16931 invoice at all. ---
  "BR-01": {
    summary: "Every invoice needs a Specification identifier (BT-24) saying which EN 16931 profile it follows.",
    why: "A receiving system reads BT-24 first to know which rule set to validate the rest of the document against.",
    fix: "Set BT-24 to the URN for the profile you're targeting, e.g. \"urn:cen.eu:en16931:2017\" for plain EN 16931, or the XRechnung/Peppol-specific URN if you're serializing one of those CIUS profiles.",
  },
  "BR-02": {
    summary: "The invoice number (BT-1) is missing.",
    why: "BT-1 is what the seller, the buyer, and any tax authority use to refer to this specific invoice; nothing about the document is addressable without it.",
    fix: "Give the invoice a non-empty number. It doesn't need to be numeric, but it does need to be unique within your own sequence.",
  },
  "BR-03": {
    summary: "The invoice issue date (BT-2) is missing.",
    why: "BT-2 anchors every date-relative rule on the invoice (payment due dates, invoicing periods, tax point dates).",
    fix: "Set BT-2 to the date the invoice was issued, in the CII date format (YYYYMMDD) or the UBL ISO 8601 date, depending which serializer you're using.",
  },
  "BR-04": {
    summary: "The invoice type code (BT-3) is missing.",
    why: "BT-3 says whether this document is a commercial invoice, a credit note, a corrective invoice, etc. — everything downstream (can it reference an original invoice, can it be negative) depends on it.",
    fix: "Set BT-3 to the UNTDID 1001 code for what this document actually is — 380 for a standard commercial invoice, 381 for a credit note.",
  },
  "BR-05": {
    summary: "The invoice currency code (BT-5) is missing.",
    why: "Every monetary amount on the invoice is only meaningful together with a currency; there is no implicit default.",
    fix: "Set BT-5 to the ISO 4217 currency code the invoice amounts are stated in, e.g. \"EUR\".",
  },
  "BR-06": {
    summary: "The seller's name (BT-27) is missing.",
    why: "The seller is one of the two parties EN 16931 requires be identifiable by name, independent of any registration number.",
    fix: "Set the seller's registered or trading name in BT-27.",
  },
  "BR-07": {
    summary: "The buyer's name (BT-44) is missing.",
    why: "Same reasoning as BR-06, for the other party to the transaction.",
    fix: "Set the buyer's registered or trading name in BT-44.",
  },
  "BR-08": {
    summary: "The seller's postal address (BG-05) is missing entirely.",
    why: "A postal address is how a receiving system and a tax authority locate the seller, independent of any electronic address.",
    fix: "Provide at least a country for the seller's postal address group; add street, city and postcode where you have them.",
  },
  "BR-09": {
    summary: "The seller's postal address is present but has no country code (BT-40).",
    why: "The country code is the one part of the address every downstream rule (VAT logic, cross-border checks) actually reads; the rest is for humans.",
    fix: "Set BT-40 to the seller's two-letter ISO 3166-1 country code.",
  },
  "BR-10": {
    summary: "The buyer's postal address (BG-08) is missing entirely.",
    why: "Same reasoning as BR-08, for the buyer.",
    fix: "Provide at least a country for the buyer's postal address group.",
  },
  "BR-11": {
    summary: "The buyer's postal address is present but has no country code (BT-55).",
    why: "Same reasoning as BR-09, for the buyer.",
    fix: "Set BT-55 to the buyer's two-letter ISO 3166-1 country code.",
  },
  "BR-12": {
    summary: "The invoice is missing the sum of all line net amounts (BT-106).",
    why: "BT-106 is the base every other total (BT-109, BT-112, BT-115) is defined in terms of; nothing reconciles without it.",
    fix: "Set BT-106 to the exact sum of every line's net amount (BT-131) — see BR-CO-10, which checks this sum is actually correct, not just present.",
  },
  "BR-13": {
    summary: "The invoice total amount without VAT (BT-109) is missing.",
    why: "This is the taxable base of the whole invoice; VAT breakdown amounts are defined relative to it.",
    fix: "Set BT-109 to line total (BT-106) minus document allowances (BT-107) plus document charges (BT-108) — see BR-CO-13 for the exact formula this is checked against.",
  },
  "BR-14": {
    summary: "The invoice total amount with VAT (BT-112) is missing.",
    why: "This is the figure most invoice readers (and most downstream accounting systems) actually care about.",
    fix: "Set BT-112 to BT-109 plus the invoice total VAT amount (BT-110) — see BR-CO-15.",
  },
  "BR-15": {
    summary: "The amount due for payment (BT-115) is missing.",
    why: "This is what the buyer is actually being asked to pay, after any prepayment or rounding — it can differ from BT-112.",
    fix: "Set BT-115 to BT-112 minus any paid amount (BT-113) plus any rounding amount (BT-114) — see BR-CO-16.",
  },
  "BR-16": {
    summary: "The invoice has no invoice lines at all.",
    why: "An invoice with zero lines has nothing for the totals rules to reconcile against; EN 16931 requires at least one.",
    fix: "Add at least one invoice line (BG-25) with a quantity, a net price and a VAT category.",
  },

  // --- Totals and tax arithmetic: the rules a hand-rolled money path gets
  // wrong before it gets rewritten to use exact integer minor units. ---
  "BR-CO-09": {
    summary: "A VAT identifier (seller, buyer, or tax representative) doesn't start with a valid ISO 3166-1 country prefix.",
    why: "The two-letter prefix on an EU VAT number (FR, DE, BE, ...) is what makes it possible to validate against VIES and route the invoice for the right jurisdiction's rules.",
    fix: "Add the two-letter country prefix to the VAT identifier — \"FR32123456789\", not \"32123456789\" — matching the country the VAT number was actually issued in (Greece is the one EU exception, using \"EL\" rather than \"GR\").",
  },
  "BR-CO-10": {
    summary: "The sum of invoice line net amount (BT-106) doesn't equal the sum of the individual lines' net amounts (BT-131).",
    why: "This is the arithmetic identity every other total is built on; if it's wrong, everything downstream is wrong too.",
    fix: "Recompute BT-106 as the exact sum of every line's BT-131, in the invoice currency's minor units — never as a running float total (see this project's own money.ts for why).",
  },
  "BR-CO-11": {
    summary: "The sum of document-level allowances (BT-107) doesn't equal the total of the individual allowance amounts (BT-92).",
    why: "BT-107 feeds directly into the BT-109 total-without-VAT calculation (BR-CO-13); an error here silently shifts the whole invoice total.",
    fix: "Recompute BT-107 as the exact sum of every document-level allowance's BT-92.",
  },
  "BR-CO-13": {
    summary: "The invoice total without VAT (BT-109) doesn't equal line total minus allowances plus charges.",
    why: "This is the taxable-base formula the whole VAT breakdown depends on: BT-109 = BT-106 − BT-107 + BT-108.",
    fix: "Recompute BT-109 from BT-106, BT-107 and BT-108 exactly, in integer minor units, not as three separately-rounded floats.",
  },
  "BR-CO-14": {
    summary: "The invoice total VAT amount (BT-110) doesn't equal the sum of the VAT breakdown's category tax amounts (BT-117).",
    why: "BT-110 has to agree with the VAT breakdown (BG-23) it's summarizing, or the invoice is internally inconsistent about how much tax is owed.",
    fix: "Recompute BT-110 as the exact sum of every VAT breakdown group's BT-117.",
  },
  "BR-CO-15": {
    summary: "The invoice total with VAT (BT-112) doesn't equal the total without VAT (BT-109) plus the total VAT amount (BT-110).",
    why: "This is the single most load-bearing arithmetic check on the whole document — it's the final gross total everyone downstream reads.",
    fix: "Recompute BT-112 as BT-109 + BT-110, in the invoice's minor currency unit, after BT-109 and BT-110 are themselves correct.",
  },
  "BR-CO-16": {
    summary: "The amount due for payment (BT-115) doesn't equal total-with-VAT minus paid amount plus rounding amount.",
    why: "BT-115 = BT-112 − BT-113 + BT-114 is what tells the buyer what to actually transfer; getting it wrong misstates a real payment obligation.",
    fix: "Recompute BT-115 from BT-112, the paid amount BT-113 (0 if nothing was prepaid) and the rounding amount BT-114 (0 if you're not rounding).",
  },
  "BR-CO-17": {
    summary: "A VAT category's tax amount (BT-117) doesn't equal its taxable amount (BT-116) times its rate (BT-119), rounded to 2 decimals.",
    why: "This is the per-category VAT calculation itself — get this wrong and the invoice states the wrong tax liability for that rate.",
    fix: "Recompute BT-117 = BT-116 × (BT-119 / 100), rounded to 2 decimal places using round-half-up, for every VAT breakdown group.",
  },
  "BR-CO-18": {
    summary: "The invoice has no VAT breakdown group (BG-23) at all.",
    why: "Every invoice, even one entirely outside the scope of VAT, needs at least one BG-23 stating that explicitly — there is no implicit \"no VAT\" state.",
    fix: "Add at least one VAT breakdown group; if nothing on the invoice is subject to VAT, use category code \"O\" (Not subject to VAT) — see BR-O-01.",
  },
  "BR-CO-26": {
    summary: "The invoice gives no way to identify the seller: no seller identifier (BT-29), legal registration identifier (BT-30), or VAT identifier (BT-31).",
    why: "A buyer's accounting system needs at least one of these to automatically match the invoice to a known supplier record.",
    fix: "Set at least one of BT-29, BT-30 or BT-31 — in practice, the seller's VAT number (BT-31) is usually the one you already have.",
  },
  "BR-DEC-14": {
    summary: "The invoice total with VAT (BT-112) has more than 2 decimal places.",
    why: "EN 16931 fixes every monetary amount to 2 decimal places; a third decimal is usually a sign that the value was computed in floating point instead of exact minor units.",
    fix: "Round BT-112 to exactly 2 decimals — or, better, stop the float rounding at the source and compute it in integer cents from the start.",
  },

  // --- VAT category rules: the leading source of confusion, because the
  // right combination of fields depends entirely on which of these codes
  // is in play (S, Z, E, AE, IC, G, O, ...). ---
  "BR-S-01": {
    summary: "The invoice has a standard-rated (\"S\") line, allowance or charge, but no matching \"S\" entry in the VAT breakdown.",
    why: "Every VAT category actually used on a line, allowance or charge must have exactly one corresponding VAT breakdown group summarizing it — that's what BG-23 is for.",
    fix: "Add a VAT breakdown group with category code \"S\" and the matching rate, or fix whichever line was categorized \"S\" by mistake.",
  },
  "BR-Z-01": {
    summary: "The invoice has a zero-rated (\"Z\") line, allowance or charge, but no matching \"Z\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for the zero-rated category — zero-rated is a real VAT category (rate is 0%, but VAT still legally applies), distinct from \"not subject to VAT\" (category O).",
    fix: "Add a VAT breakdown group with category code \"Z\", or correct the line's category if it isn't actually zero-rated.",
  },
  "BR-Z-10": {
    summary: "A zero-rated (\"Z\") VAT breakdown carries a VAT exemption reason code or text, which it shouldn't.",
    why: "Zero-rated and exempt are different categories with different legal bases; giving \"Z\" an exemption reason conflates the two (this project's own negative-control fixture exists specifically to prove this rule is enforced — see fixtures/negative/z-with-vatex.json).",
    fix: "Remove BT-120/BT-121 from the zero-rated breakdown group. If the line is actually exempt rather than zero-rated, use category \"E\" instead, which requires an exemption reason (see BR-E-10).",
  },
  "BR-E-01": {
    summary: "The invoice has an exempt (\"E\") line, allowance or charge, but no matching \"E\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for the exempt category.",
    fix: "Add a VAT breakdown group with category code \"E\" and a VAT exemption reason — see BR-E-10.",
  },
  "BR-E-10": {
    summary: "An exempt (\"E\") VAT breakdown has no VAT exemption reason code or text.",
    why: "Unlike zero-rated, an exemption has to state its legal basis — \"exempt\" alone doesn't say why VAT doesn't apply.",
    fix: "Set BT-121 (a VATEX code, preferred) or BT-120 (free text) to the specific reason this supply is exempt.",
  },
  "BR-AE-01": {
    summary: "The invoice has a reverse-charge (\"AE\") line, allowance or charge, but no matching \"AE\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for reverse charge, where the buyer rather than the seller accounts for the VAT.",
    fix: "Add a VAT breakdown group with category code \"AE\" and a VAT exemption reason indicating reverse charge — see BR-AE-10.",
  },
  "BR-AE-10": {
    summary: "A reverse-charge (\"AE\") VAT breakdown doesn't state \"Reverse charge\" as its exemption reason.",
    why: "The reason field is what tells the buyer's system to self-account for the VAT rather than expect the seller to have charged it.",
    fix: "Set BT-121 to the VATEX code for reverse charge (\"VATEX-EU-AE\") or BT-120 to the text \"Reverse charge\".",
  },
  "BR-IC-01": {
    summary: "The invoice has an intra-community supply (\"K\") line, allowance or charge, but no matching \"K\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for intra-community supplies between VAT-registered EU businesses.",
    fix: "Add a VAT breakdown group with category code \"K\"; also check BR-IC-11 and BR-IC-12, which require a delivery date or country for this category.",
  },

  // --- French CTC (BR-FR-*, Flux 2): the layer this project's own sample
  // invoice failed on first attempt (see docs/pdf-traps.md). ---
  "BR-FR-01": {
    summary: "The invoice number is longer than 35 characters, or uses characters the French mandate doesn't allow.",
    why: "France's e-invoicing platform enforces a stricter invoice-identifier format than EN 16931 does, since it has to route and reconcile the number across the whole national exchange.",
    fix: "Shorten the invoice number to 35 characters or fewer, using only the characters the mandate allows (letters, digits and a small set of punctuation).",
  },
  "BR-FR-03": {
    summary: "A date on the invoice falls outside the year range 2000–2099.",
    why: "The French platform's date fields are fixed-width and only accept a 4-digit year in this range — anything else is almost always a data-entry or format bug, not a real invoice date.",
    fix: "Check the field this was reported against (issue date, tax point date, due date, delivery date, or an invoicing/line period date) and correct the year.",
  },
  "BR-FR-10": {
    summary: "The seller's SIREN (legal registration identifier, BT-30) is missing or isn't exactly 9 digits.",
    why: "SIREN is how the French tax administration identifies a business; the national platform can't route the invoice without a valid one.",
    fix: "Set BT-30 to the seller's 9-digit SIREN number, with scheme identifier \"0002\", and nothing else in the field.",
  },
  "BR-FR-32": {
    summary: "A party identifier using the French SIREN/SIRET scheme (schemeID \"0002\") doesn't contain exactly 9 digits.",
    why: "Same underlying requirement as BR-FR-10, applied generically to any party carrying a scheme-0002 identifier, not only the seller.",
    fix: "Correct the identifier to exactly 9 digits, or use a different schemeID if the value isn't actually a SIREN.",
  },
  "BR-FR-CO-08": {
    summary: "The billing framework code (BT-23) is inconsistent with the invoice type code (BT-3) — specifically, a \"final invoice after deposit\" framework combined with a deposit invoice/credit-note type code.",
    why: "BT-23's closed list of 20 values encodes how this invoice relates to any deposit already invoiced; some combinations with BT-3 are contradictory by definition (a document can't simultaneously be the deposit and the final invoice settling it).",
    fix: "Pick the BT-23 value that actually matches this document's role, or change BT-3 if this genuinely is a deposit invoice/credit note rather than a final one.",
  },
};
