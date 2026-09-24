import type { PlainLanguageMessage } from "../types.js";

/**
 * Plain-language translations of the official Schematron rule text.
 *
 * Every entry's summary/why/fix is this project's own wording, but every
 * official rule statement it's translating was extracted verbatim from the
 * compiled artefact itself (the `factur-x` pip package's
 * `Factur-X_1.09_EN16931.xsl`, the same file `tools/compile-schematron.sh`
 * compiles) — not from memory, not paraphrased from a secondary source. That
 * matters here specifically because these are meant to read as authoritative:
 * getting an official rule's substance wrong would be worse than not
 * translating it at all.
 *
 * Coverage (see `packages/validate/src/coverage.ts` / `npm run
 * report:message-coverage` for the live number, also printed in the
 * README): every mandatory-field rule (BR-01..BR-16), every BR-CO-*
 * (cross-field/arithmetic) rule, and every member of every VAT-category
 * family (BR-S/Z/E/AE/IC/G/O-*, the categories a normal invoice actually
 * hits), plus the French CTC rules this project's own sample invoice failed
 * against in an earlier pass (see docs/pdf-traps.md). Not yet written: BR-17..65
 * (mostly single-field presence/format rules on payee, delivery and
 * item-attribute groups no current fixture exercises), BR-DEC-* beyond
 * BR-DEC-14 (all "at most 2 decimal places", same shape repeated ~20 times),
 * and BR-AF/AG/B (Italian domestic split-payment and reverse-charge variants
 * outside this project's target countries). None of that is a silent gap: no
 * rule ever reaches a caller as raw `[BR-XX]-` text regardless — the SVRL
 * parser (src/svrl.ts) strips that bracket from every message unconditionally,
 * hand-written or not; a rule without an entry here just falls back to the
 * official Schematron sentence with the bracket removed, not a hidden entry.
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

  // --- Totals and tax arithmetic (BR-CO-*): the rules a hand-rolled money
  // path gets wrong before it gets rewritten to use exact integer minor
  // units, plus the "reason text and reason code must agree" and
  // "at least one of these two fields" consistency checks. ---
  "BR-CO-03": {
    summary: "The invoice sets both a specific VAT point date (BT-7) and a VAT point date code (BT-8) — only one is allowed.",
    why: "The two fields are two different ways of saying when VAT becomes chargeable; setting both leaves it ambiguous which one actually governs.",
    fix: "Keep whichever one you have — an exact date in BT-7, or a coded description of when the tax point falls in BT-8 — and remove the other.",
  },
  "BR-CO-04": {
    summary: "One or more invoice lines have no VAT category code (BT-151).",
    why: "Every line needs its own VAT category so the invoice's VAT breakdown can be built line by line; there is no invoice-wide default category.",
    fix: "Set a VAT category code on every line — \"S\" for standard rate, \"Z\" for zero-rated, \"E\" for exempt, and so on.",
  },
  "BR-CO-05": {
    summary: "A document-level allowance's reason code (BT-98) and its free-text reason (BT-97) don't appear to describe the same discount.",
    why: "When both are given, a receiving system needs them to agree on what the allowance actually is, not describe two different things.",
    fix: "Make the free-text reason (BT-97) match the kind of allowance named by the reason code (BT-98), or set only one of the two.",
  },
  "BR-CO-06": {
    summary: "A document-level charge's reason code (BT-105) and its free-text reason (BT-104) don't appear to describe the same charge.",
    why: "Same reasoning as BR-CO-05, for a charge rather than an allowance.",
    fix: "Make the free-text reason (BT-104) match the reason code (BT-105), or set only one of the two.",
  },
  "BR-CO-07": {
    summary: "An invoice line's allowance reason code (BT-140) and its free-text reason (BT-139) don't appear to describe the same discount.",
    why: "Same reasoning as BR-CO-05, applied to a line-level allowance instead of a document-level one.",
    fix: "Make the free-text reason (BT-139) match the reason code (BT-140), or set only one of the two.",
  },
  "BR-CO-08": {
    summary: "An invoice line's charge reason code (BT-145) and its free-text reason (BT-144) don't appear to describe the same charge.",
    why: "Same reasoning as BR-CO-05, applied to a line-level charge instead of a document-level one.",
    fix: "Make the free-text reason (BT-144) match the reason code (BT-145), or set only one of the two.",
  },
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
  "BR-CO-12": {
    summary: "The sum of document-level charges (BT-108) doesn't equal the total of the individual charge amounts (BT-99).",
    why: "Same reasoning as BR-CO-11, for charges: BT-108 feeds directly into BT-109 (BR-CO-13).",
    fix: "Recompute BT-108 as the exact sum of every document-level charge's BT-99.",
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
  "BR-CO-19": {
    summary: "An invoicing period (BG-14) is present but has neither a start date (BT-73) nor an end date (BT-74).",
    why: "A billing period with no boundary at all doesn't tell a reader what timespan the invoice actually covers.",
    fix: "Set at least one of the invoicing period's start or end date — ideally both — or remove the period group if it doesn't apply.",
  },
  "BR-CO-20": {
    summary: "An invoice line's billing period (BG-26) is present but has neither a start date (BT-134) nor an end date (BT-135).",
    why: "Same reasoning as BR-CO-19, for a period scoped to one line rather than the whole invoice.",
    fix: "Set at least one of the line period's start or end date, or remove the period group from that line.",
  },
  "BR-CO-21": {
    summary: "A document-level allowance has neither a reason text (BT-97) nor a reason code (BT-98).",
    why: "An unexplained discount on the invoice total is exactly the kind of thing an auditor or the buyer's accounts team will query.",
    fix: "Add a reason code (BT-98), a free-text reason (BT-97), or both, to every document-level allowance.",
  },
  "BR-CO-22": {
    summary: "A document-level charge has neither a reason text (BT-104) nor a reason code (BT-105).",
    why: "Same reasoning as BR-CO-21, for an added charge rather than a discount.",
    fix: "Add a reason code (BT-105), a free-text reason (BT-104), or both, to every document-level charge.",
  },
  "BR-CO-23": {
    summary: "An invoice-line allowance has neither a reason text (BT-139) nor a reason code (BT-140).",
    why: "Same reasoning as BR-CO-21, for a discount applied to one line instead of the whole document.",
    fix: "Add a reason code (BT-140), a free-text reason (BT-139), or both, to every line-level allowance.",
  },
  "BR-CO-24": {
    summary: "An invoice-line charge has neither a reason text (BT-144) nor a reason code (BT-145).",
    why: "Same reasoning as BR-CO-21, for a charge applied to one line instead of the whole document.",
    fix: "Add a reason code (BT-145), a free-text reason (BT-144), or both, to every line-level charge.",
  },
  "BR-CO-26": {
    summary: "The invoice gives no way to identify the seller: no seller identifier (BT-29), legal registration identifier (BT-30), or VAT identifier (BT-31).",
    why: "A buyer's accounting system needs at least one of these to automatically match the invoice to a known supplier record.",
    fix: "Set at least one of BT-29, BT-30 or BT-31 — in practice, the seller's VAT number (BT-31) is usually the one you already have.",
  },
  "BR-CO-27": {
    summary: "The payment account identifier (BT-84) isn't clearly either an IBAN or an explicitly proprietary account number.",
    why: "A receiving system needs to know which shape it's reading before it can process a bank transfer against it.",
    fix: "Set BT-84 to a valid IBAN, or use the payment-means code that marks it as a proprietary (non-IBAN) account number.",
  },
  "BR-DEC-14": {
    summary: "The invoice total with VAT (BT-112) has more than 2 decimal places.",
    why: "EN 16931 fixes every monetary amount to 2 decimal places; a third decimal is usually a sign that the value was computed in floating point instead of exact minor units.",
    fix: "Round BT-112 to exactly 2 decimals — or, better, stop the float rounding at the source and compute it in integer cents from the start.",
  },

  // --- VAT category rules: the leading source of confusion, because the
  // right combination of fields depends entirely on which of these codes is
  // in play. Each family below (S, Z, E, AE, IC, G) follows the same shape —
  // a line/allowance/charge in that category needs a matching VAT breakdown
  // entry (rule 01), the seller (and for some categories, the buyer) needs
  // to be VAT-identifiable (02-04), the category's rate has to be right
  // (05-07, >0 for standard-rated, exactly 0 for everything else that still
  // carries VAT-relevant meaning), the breakdown's taxable and tax amounts
  // have to reconcile against exactly the lines/allowances/charges in that
  // category (08-09), and — except for standard-rated — the breakdown needs
  // an exemption reason saying why VAT doesn't apply the normal way (10). ---
  "BR-S-01": {
    summary: "The invoice has a standard-rated (\"S\") line, allowance or charge, but no matching \"S\" entry in the VAT breakdown.",
    why: "Every VAT category actually used on a line, allowance or charge must have exactly one corresponding VAT breakdown group summarizing it — that's what BG-23 is for.",
    fix: "Add a VAT breakdown group with category code \"S\" and the matching rate, or fix whichever line was categorized \"S\" by mistake.",
  },
  "BR-S-02": {
    summary: "A standard-rated (\"S\") invoice line is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Charging standard-rate VAT means the seller is accounting for it under a specific registration; the buyer needs to know which one.",
    fix: "Set at least one of BT-31, BT-32, or BT-63 (if a tax representative handles the seller's VAT).",
  },
  "BR-S-03": {
    summary: "A standard-rated (\"S\") document-level allowance is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-S-02, applied to a document-level discount instead of a line.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-S-04": {
    summary: "A standard-rated (\"S\") document-level charge is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-S-02, applied to a document-level charge instead of a line.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-S-05": {
    summary: "A standard-rated (\"S\") line's VAT rate (BT-152) is zero or missing.",
    why: "Standard rate is, by definition, a positive percentage — a zero rate here would make it indistinguishable from zero-rated (\"Z\") or not-subject-to-VAT (\"O\").",
    fix: "Set the line's VAT rate to the actual standard rate that applies (e.g. 20), or change its category if it isn't really taxed at the standard rate.",
  },
  "BR-S-06": {
    summary: "A standard-rated (\"S\") document-level allowance's VAT rate (BT-96) is zero or missing.",
    why: "Same reasoning as BR-S-05, for a document-level allowance rather than a line.",
    fix: "Set the allowance's VAT rate to the actual standard rate, or change its category.",
  },
  "BR-S-07": {
    summary: "A standard-rated (\"S\") document-level charge's VAT rate (BT-103) is zero or missing.",
    why: "Same reasoning as BR-S-05, for a document-level charge rather than a line.",
    fix: "Set the charge's VAT rate to the actual standard rate, or change its category.",
  },
  "BR-S-08": {
    summary: "For a given standard rate, the VAT breakdown's taxable amount (BT-116) doesn't equal the standard-rated lines and charges minus the standard-rated allowances at that same rate.",
    why: "Every distinct standard rate on the invoice needs its own internally-consistent breakdown group — the same reconciliation BR-CO-13 does for the invoice as a whole, done per rate.",
    fix: "Recompute that rate's taxable amount from exactly the lines, allowances and charges carrying that specific standard rate.",
  },
  "BR-S-09": {
    summary: "A standard-rated breakdown's tax amount (BT-117) doesn't equal its taxable amount (BT-116) multiplied by its rate (BT-119).",
    why: "Same per-category calculation as BR-CO-17, checked specifically for the standard-rated breakdown group.",
    fix: "Recompute BT-117 as BT-116 × (BT-119 / 100) for the standard-rated group.",
  },
  "BR-S-10": {
    summary: "A standard-rated (\"S\") VAT breakdown carries an exemption reason code or text, which it shouldn't.",
    why: "Standard-rated means fully taxed at the normal rate — there's nothing to exempt, so a reason field here is contradictory (the same reasoning BR-Z-10 applies to zero-rated).",
    fix: "Remove BT-120/BT-121 from the standard-rated breakdown group.",
  },
  "BR-Z-01": {
    summary: "The invoice has a zero-rated (\"Z\") line, allowance or charge, but no matching \"Z\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for the zero-rated category — zero-rated is a real VAT category (rate is 0%, but VAT still legally applies), distinct from \"not subject to VAT\" (category O).",
    fix: "Add a VAT breakdown group with category code \"Z\", or correct the line's category if it isn't actually zero-rated.",
  },
  "BR-Z-02": {
    summary: "A zero-rated (\"Z\") invoice line is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Zero-rated is still a VAT category the seller accounts for under a specific registration, even though the rate charged is 0%.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-Z-03": {
    summary: "A zero-rated (\"Z\") document-level allowance is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-Z-02, applied to a document-level discount.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-Z-04": {
    summary: "A zero-rated (\"Z\") document-level charge is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-Z-02, applied to a document-level charge.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-Z-05": {
    summary: "A zero-rated (\"Z\") line's VAT rate (BT-152) isn't exactly 0.",
    why: "The whole point of the zero-rated category is that the rate is 0% — a non-zero rate contradicts the category.",
    fix: "Set the line's VAT rate to 0, or change the category if a non-zero rate actually applies.",
  },
  "BR-Z-06": {
    summary: "A zero-rated (\"Z\") document-level allowance's VAT rate (BT-96) isn't exactly 0.",
    why: "Same reasoning as BR-Z-05, for a document-level allowance.",
    fix: "Set the allowance's VAT rate to 0, or change its category.",
  },
  "BR-Z-07": {
    summary: "A zero-rated (\"Z\") document-level charge's VAT rate (BT-103) isn't exactly 0.",
    why: "Same reasoning as BR-Z-05, for a document-level charge.",
    fix: "Set the charge's VAT rate to 0, or change its category.",
  },
  "BR-Z-08": {
    summary: "The zero-rated VAT breakdown's taxable amount (BT-116) doesn't equal the zero-rated lines and charges minus the zero-rated allowances.",
    why: "Same per-category reconciliation as BR-S-08, for the zero-rated breakdown group.",
    fix: "Recompute the zero-rated breakdown's taxable amount from exactly the zero-rated lines, allowances and charges.",
  },
  "BR-Z-09": {
    summary: "The zero-rated VAT breakdown's tax amount (BT-117) isn't exactly 0.",
    why: "A zero-rated breakdown is taxed at 0%, so its calculated VAT amount has to be exactly zero, not just small.",
    fix: "Set the zero-rated breakdown's tax amount to 0.",
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
  "BR-E-02": {
    summary: "An exempt (\"E\") invoice line is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Being VAT-exempt on this supply doesn't exempt the seller from being identifiable under its own VAT registration.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-E-03": {
    summary: "An exempt (\"E\") document-level allowance is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-E-02, applied to a document-level discount.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-E-04": {
    summary: "An exempt (\"E\") document-level charge is present, but none of the seller's VAT identifier (BT-31), tax registration identifier (BT-32), or tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-E-02, applied to a document-level charge.",
    fix: "Set at least one of BT-31, BT-32, or BT-63.",
  },
  "BR-E-05": {
    summary: "An exempt (\"E\") line's VAT rate (BT-152) isn't exactly 0.",
    why: "An exempt supply has no VAT rate to speak of — it isn't taxed at 0%, it isn't taxed at all — so the rate field must be 0.",
    fix: "Set the line's VAT rate to 0, or change the category if VAT actually applies.",
  },
  "BR-E-06": {
    summary: "An exempt (\"E\") document-level allowance's VAT rate (BT-96) isn't exactly 0.",
    why: "Same reasoning as BR-E-05, for a document-level allowance.",
    fix: "Set the allowance's VAT rate to 0, or change its category.",
  },
  "BR-E-07": {
    summary: "An exempt (\"E\") document-level charge's VAT rate (BT-103) isn't exactly 0.",
    why: "Same reasoning as BR-E-05, for a document-level charge.",
    fix: "Set the charge's VAT rate to 0, or change its category.",
  },
  "BR-E-08": {
    summary: "The exempt VAT breakdown's taxable amount (BT-116) doesn't equal the exempt lines and charges minus the exempt allowances.",
    why: "Same per-category reconciliation as BR-S-08, for the exempt breakdown group.",
    fix: "Recompute the exempt breakdown's taxable amount from exactly the exempt lines, allowances and charges.",
  },
  "BR-E-09": {
    summary: "The exempt VAT breakdown's tax amount (BT-117) isn't exactly 0.",
    why: "An exempt supply carries no VAT at all, so the calculated amount has to be exactly zero.",
    fix: "Set the exempt breakdown's tax amount to 0.",
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
  "BR-AE-02": {
    summary: "A reverse-charge (\"AE\") invoice line is present, but the seller isn't VAT-identified (BT-31/BT-32/BT-63) and/or the buyer isn't VAT-identified (BT-48/BT-47).",
    why: "Reverse charge shifts who accounts for the VAT to the buyer — a receiving system needs both parties' VAT identity to process that correctly.",
    fix: "Set at least one of the seller's BT-31, BT-32 or BT-63, and at least one of the buyer's BT-48 or BT-47.",
  },
  "BR-AE-03": {
    summary: "A reverse-charge (\"AE\") document-level allowance is present, but the seller and/or buyer aren't VAT-identified.",
    why: "Same reasoning as BR-AE-02, applied to a document-level discount.",
    fix: "Set at least one seller VAT-related field (BT-31/BT-32/BT-63) and at least one buyer VAT-related field (BT-48/BT-47).",
  },
  "BR-AE-04": {
    summary: "A reverse-charge (\"AE\") document-level charge is present, but the seller and/or buyer aren't VAT-identified.",
    why: "Same reasoning as BR-AE-02, applied to a document-level charge.",
    fix: "Set at least one seller VAT-related field (BT-31/BT-32/BT-63) and at least one buyer VAT-related field (BT-48/BT-47).",
  },
  "BR-AE-05": {
    summary: "A reverse-charge (\"AE\") line's VAT rate (BT-152) isn't exactly 0.",
    why: "Under reverse charge the seller never charges VAT at all — the buyer self-accounts for it — so the seller's stated rate must be 0.",
    fix: "Set the line's VAT rate to 0, or change the category if the seller genuinely is charging VAT.",
  },
  "BR-AE-06": {
    summary: "A reverse-charge (\"AE\") document-level allowance's VAT rate (BT-96) isn't exactly 0.",
    why: "Same reasoning as BR-AE-05, for a document-level allowance.",
    fix: "Set the allowance's VAT rate to 0, or change its category.",
  },
  "BR-AE-07": {
    summary: "A reverse-charge (\"AE\") document-level charge's VAT rate (BT-103) isn't exactly 0.",
    why: "Same reasoning as BR-AE-05, for a document-level charge.",
    fix: "Set the charge's VAT rate to 0, or change its category.",
  },
  "BR-AE-08": {
    summary: "The reverse-charge VAT breakdown's taxable amount (BT-116) doesn't equal the reverse-charge lines and charges minus the reverse-charge allowances.",
    why: "Same per-category reconciliation as BR-S-08, for the reverse-charge breakdown group.",
    fix: "Recompute the reverse-charge breakdown's taxable amount from exactly the reverse-charge lines, allowances and charges.",
  },
  "BR-AE-09": {
    summary: "The reverse-charge VAT breakdown's tax amount (BT-117) isn't exactly 0.",
    why: "The seller charges no VAT under reverse charge, so the calculated amount on this breakdown has to be exactly zero.",
    fix: "Set the reverse-charge breakdown's tax amount to 0.",
  },
  "BR-AE-10": {
    summary: "A reverse-charge (\"AE\") VAT breakdown has no VAT exemption reason code or text identifying it as reverse charge.",
    why: "The reason field is what tells the buyer's system to self-account for the VAT rather than expect the seller to have charged it.",
    fix: "Set BT-121 to the VATEX code for reverse charge (\"VATEX-EU-AE\") or BT-120 to the text \"Reverse charge\".",
  },
  "BR-IC-01": {
    summary: "The invoice has an intra-community supply (\"K\") line, allowance or charge, but no matching \"K\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for intra-community supplies between VAT-registered EU businesses.",
    fix: "Add a VAT breakdown group with category code \"K\"; also check BR-IC-11 and BR-IC-12, which require a delivery date or country for this category.",
  },
  "BR-IC-02": {
    summary: "An intra-community-supply (\"K\") invoice line is present, but the seller isn't VAT-identified (BT-31/BT-63) and/or the buyer's VAT identifier (BT-48) is missing.",
    why: "An intra-community supply is exempt specifically because both trading parties are VAT-registered in different EU states — a receiving system needs both VAT numbers to confirm that.",
    fix: "Set at least one of the seller's BT-31 or BT-63, and the buyer's VAT identifier (BT-48).",
  },
  "BR-IC-03": {
    summary: "An intra-community-supply (\"K\") document-level allowance is present, but the seller and/or buyer VAT identification is missing.",
    why: "Same reasoning as BR-IC-02, applied to a document-level discount.",
    fix: "Set at least one seller VAT field (BT-31/BT-63) and the buyer's VAT identifier (BT-48).",
  },
  "BR-IC-04": {
    summary: "An intra-community-supply (\"K\") document-level charge is present, but the seller and/or buyer VAT identification is missing.",
    why: "Same reasoning as BR-IC-02, applied to a document-level charge.",
    fix: "Set at least one seller VAT field (BT-31/BT-63) and the buyer's VAT identifier (BT-48).",
  },
  "BR-IC-05": {
    summary: "An intra-community-supply (\"K\") line's VAT rate (BT-152) isn't exactly 0.",
    why: "An intra-community supply is zero-VAT by construction (the buyer accounts for acquisition VAT in its own country), so the seller's stated rate must be 0.",
    fix: "Set the line's VAT rate to 0, or change the category if this genuinely isn't an intra-community supply.",
  },
  "BR-IC-06": {
    summary: "An intra-community-supply (\"K\") document-level allowance's VAT rate (BT-96) isn't exactly 0.",
    why: "Same reasoning as BR-IC-05, for a document-level allowance.",
    fix: "Set the allowance's VAT rate to 0, or change its category.",
  },
  "BR-IC-07": {
    summary: "An intra-community-supply (\"K\") document-level charge's VAT rate (BT-103) isn't exactly 0.",
    why: "Same reasoning as BR-IC-05, for a document-level charge.",
    fix: "Set the charge's VAT rate to 0, or change its category.",
  },
  "BR-IC-08": {
    summary: "The intra-community-supply VAT breakdown's taxable amount (BT-116) doesn't equal the intra-community lines and charges minus the intra-community allowances.",
    why: "Same per-category reconciliation as BR-S-08, for the intra-community-supply breakdown group.",
    fix: "Recompute the breakdown's taxable amount from exactly the intra-community lines, allowances and charges.",
  },
  "BR-IC-09": {
    summary: "The intra-community-supply VAT breakdown's tax amount (BT-117) isn't exactly 0.",
    why: "The supply carries no seller-charged VAT, so the calculated amount on this breakdown has to be exactly zero.",
    fix: "Set the intra-community-supply breakdown's tax amount to 0.",
  },
  "BR-IC-10": {
    summary: "An intra-community-supply (\"K\") VAT breakdown has no VAT exemption reason code or text.",
    why: "Same reasoning as BR-E-10 — the breakdown has to state why VAT doesn't apply the normal way, not just that it doesn't.",
    fix: "Set BT-121 (a VATEX code) or BT-120 (free text) explaining this is an intra-community supply.",
  },
  "BR-IC-11": {
    summary: "The invoice has an intra-community-supply (\"K\") VAT breakdown, but neither an actual delivery date (BT-72) nor an invoicing period (BG-14) is given.",
    why: "Intra-community VAT exemption depends on the goods actually having moved between member states at a specific time; a receiving tax authority needs that date to check the exemption is real.",
    fix: "Set the actual delivery date (BT-72), or an invoicing period covering when the supply happened.",
  },
  "BR-IC-12": {
    summary: "The invoice has an intra-community-supply (\"K\") VAT breakdown, but the deliver-to country code (BT-80) is missing.",
    why: "The exemption specifically depends on the goods crossing into another EU member state — without a destination country, that can't be confirmed.",
    fix: "Set BT-80 to the two-letter country code goods were delivered to.",
  },
  "BR-G-01": {
    summary: "The invoice has an export-outside-the-EU (\"G\") line, allowance or charge, but no matching \"G\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for goods or services exported outside the EU.",
    fix: "Add a VAT breakdown group with category code \"G\".",
  },
  "BR-G-02": {
    summary: "An export-outside-the-EU (\"G\") invoice line is present, but neither the seller's VAT identifier (BT-31) nor their tax representative's VAT identifier (BT-63) is set.",
    why: "The seller still needs to be VAT-identifiable even on an export, which is why this category exists as zero-rated rather than simply out of scope.",
    fix: "Set the seller's VAT identifier (BT-31) or their tax representative's VAT identifier (BT-63).",
  },
  "BR-G-03": {
    summary: "An export-outside-the-EU (\"G\") document-level allowance is present, but neither the seller's VAT identifier (BT-31) nor their tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-G-02, applied to a document-level discount.",
    fix: "Set the seller's VAT identifier (BT-31) or their tax representative's VAT identifier (BT-63).",
  },
  "BR-G-04": {
    summary: "An export-outside-the-EU (\"G\") document-level charge is present, but neither the seller's VAT identifier (BT-31) nor their tax representative's VAT identifier (BT-63) is set.",
    why: "Same reasoning as BR-G-02, applied to a document-level charge.",
    fix: "Set the seller's VAT identifier (BT-31) or their tax representative's VAT identifier (BT-63).",
  },
  "BR-G-05": {
    summary: "An export-outside-the-EU (\"G\") line's VAT rate (BT-152) isn't exactly 0.",
    why: "Exports outside the EU are zero-rated by construction, so the stated rate must be 0.",
    fix: "Set the line's VAT rate to 0, or change the category if this isn't actually an export outside the EU.",
  },
  "BR-G-06": {
    summary: "An export-outside-the-EU (\"G\") document-level allowance's VAT rate (BT-96) isn't exactly 0.",
    why: "Same reasoning as BR-G-05, for a document-level allowance.",
    fix: "Set the allowance's VAT rate to 0, or change its category.",
  },
  "BR-G-07": {
    summary: "An export-outside-the-EU (\"G\") document-level charge's VAT rate (BT-103) isn't exactly 0.",
    why: "Same reasoning as BR-G-05, for a document-level charge.",
    fix: "Set the charge's VAT rate to 0, or change its category.",
  },
  "BR-G-08": {
    summary: "The export-outside-the-EU VAT breakdown's taxable amount (BT-116) doesn't equal the export lines and charges minus the export allowances.",
    why: "Same per-category reconciliation as BR-S-08, for the export breakdown group.",
    fix: "Recompute the breakdown's taxable amount from exactly the export lines, allowances and charges.",
  },
  "BR-G-09": {
    summary: "The export-outside-the-EU VAT breakdown's tax amount (BT-117) isn't exactly 0.",
    why: "Exports carry no VAT, so the calculated amount on this breakdown has to be exactly zero.",
    fix: "Set the export breakdown's tax amount to 0.",
  },
  "BR-G-10": {
    summary: "An export-outside-the-EU (\"G\") VAT breakdown has no VAT exemption reason code or text.",
    why: "Same reasoning as BR-E-10 — the breakdown has to state why VAT doesn't apply, not just that it doesn't.",
    fix: "Set BT-121 (a VATEX code) or BT-120 (free text) explaining this is an export outside the EU.",
  },

  // --- Not subject to VAT ("O"): shaped differently from the other category
  // families above — an "O" line must NOT carry a VAT rate at all (not even
  // zero, see packages/core/src/model.ts's own note on this), the seller
  // must NOT be VAT-identified on it, and an invoice using category O can't
  // mix it with any other VAT category at all. Exercised by this project's
  // own fixtures/not-subject-to-vat-o.json. ---
  "BR-O-01": {
    summary: "The invoice has a not-subject-to-VAT (\"O\") line, allowance or charge, but no matching \"O\" entry in the VAT breakdown.",
    why: "Same rule as BR-S-01, for supplies that are entirely outside the scope of VAT.",
    fix: "Add a VAT breakdown group with category code \"O\".",
  },
  "BR-O-02": {
    summary: "A not-subject-to-VAT (\"O\") invoice line carries a seller or buyer VAT identifier, which it shouldn't.",
    why: "Unlike the other categories, \"O\" means this transaction isn't a VAT-registered seller's taxable supply at all — attaching a VAT identifier to it is contradictory.",
    fix: "Remove the seller's VAT identifier (BT-31), tax representative VAT identifier (BT-63), and the buyer's VAT identifier (BT-46) from this context, or change the category if VAT genuinely applies.",
  },
  "BR-O-03": {
    summary: "A not-subject-to-VAT (\"O\") document-level allowance carries a seller or buyer VAT identifier, which it shouldn't.",
    why: "Same reasoning as BR-O-02, applied to a document-level discount.",
    fix: "Remove the VAT identifier fields from this context, or change the category.",
  },
  "BR-O-04": {
    summary: "A not-subject-to-VAT (\"O\") document-level charge carries a seller or buyer VAT identifier, which it shouldn't.",
    why: "Same reasoning as BR-O-02, applied to a document-level charge.",
    fix: "Remove the VAT identifier fields from this context, or change the category.",
  },
  "BR-O-05": {
    summary: "A not-subject-to-VAT (\"O\") line has a VAT rate set, which it shouldn't.",
    why: "\"O\" means no VAT rate applies at all — not even 0% — so the field has to be absent entirely, not just zero (this is why this project's own core model ignores a line's rate whenever its category is \"O\").",
    fix: "Remove the VAT rate from this line, or change the category if a rate genuinely applies.",
  },
  "BR-O-06": {
    summary: "A not-subject-to-VAT (\"O\") document-level allowance has a VAT rate set, which it shouldn't.",
    why: "Same reasoning as BR-O-05, for a document-level allowance.",
    fix: "Remove the VAT rate from this allowance, or change its category.",
  },
  "BR-O-07": {
    summary: "A not-subject-to-VAT (\"O\") document-level charge has a VAT rate set, which it shouldn't.",
    why: "Same reasoning as BR-O-05, for a document-level charge.",
    fix: "Remove the VAT rate from this charge, or change its category.",
  },
  "BR-O-08": {
    summary: "The not-subject-to-VAT VAT breakdown's taxable amount (BT-116) doesn't equal the \"O\" lines and charges minus the \"O\" allowances.",
    why: "Same per-category reconciliation as BR-S-08, for the not-subject-to-VAT breakdown group.",
    fix: "Recompute the breakdown's taxable amount from exactly the \"O\" lines, allowances and charges.",
  },
  "BR-O-09": {
    summary: "The not-subject-to-VAT VAT breakdown's tax amount (BT-117) isn't exactly 0.",
    why: "Nothing in this category is taxed, so the calculated VAT amount has to be exactly zero.",
    fix: "Set the not-subject-to-VAT breakdown's tax amount to 0.",
  },
  "BR-O-10": {
    summary: "A not-subject-to-VAT (\"O\") VAT breakdown has no VAT exemption reason code or text.",
    why: "Same reasoning as BR-E-10 — the breakdown has to state why VAT doesn't apply, not just that it doesn't.",
    fix: "Set BT-121 (a VATEX code) or BT-120 (free text) explaining that this is outside the scope of VAT.",
  },
  "BR-O-11": {
    summary: "An invoice has a not-subject-to-VAT (\"O\") VAT breakdown alongside at least one other VAT breakdown group.",
    why: "\"O\" means the whole invoice's business (for that breakdown) is outside VAT's scope entirely — it can't share the document with a taxed breakdown.",
    fix: "An invoice is either entirely not subject to VAT, or it isn't — split mixed invoices into separate documents, or correct whichever lines were categorized \"O\" by mistake.",
  },
  "BR-O-12": {
    summary: "An invoice has a not-subject-to-VAT (\"O\") VAT breakdown, but also a line categorized as something other than \"O\".",
    why: "Same reasoning as BR-O-11 — every line has to agree that the whole invoice is out of VAT's scope.",
    fix: "Change the other line's category to \"O\", or remove the not-subject-to-VAT breakdown if this invoice does have taxable lines.",
  },
  "BR-O-13": {
    summary: "An invoice has a not-subject-to-VAT (\"O\") VAT breakdown, but also a document-level allowance categorized as something other than \"O\".",
    why: "Same reasoning as BR-O-11, for a document-level allowance.",
    fix: "Change the allowance's category to \"O\", or remove the not-subject-to-VAT breakdown if it doesn't apply.",
  },
  "BR-O-14": {
    summary: "An invoice has a not-subject-to-VAT (\"O\") VAT breakdown, but also a document-level charge categorized as something other than \"O\".",
    why: "Same reasoning as BR-O-11, for a document-level charge.",
    fix: "Change the charge's category to \"O\", or remove the not-subject-to-VAT breakdown if it doesn't apply.",
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
