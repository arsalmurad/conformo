import type { Invoice } from '@conformo/core';
import type { FacturXProfile } from '@conformo/pdf';
import { standardRate } from './countries.js';

/**
 * "Who is this invoice for?" — the one question that decides which official rules apply. Each answer maps to exactly
 * one serialization profile and one set of official rule sets; the mapping is checked against the compliance dataset
 * (packages/compliance-data/src/data/{de,fr}.json, requiredFormats) and against the rule sets themselves by
 * test/ui-audience.test.ts: every field listed in `required` below must really be demanded by the cited official rule.
 *
 * - de-b2b: Germany accepts ZUGFeRD 2.x hybrid PDFs in the EN 16931 profile (de.json B2B: xrechnung, zugferd). No
 *   Leitweg-ID: that is a public-sector routing id. Checked against the EN 16931 CII rules.
 * - de-b2g: German public authorities require XRechnung (de.json B2G). The KoSIT XRechnung 3.0 rules add BR-DE-15
 *   (BT-10 buyer reference = Leitweg-ID), BR-DE-2 (BG-6 seller contact) and the PEPPOL-EN16931-R010/R020 electronic
 *   addresses on top of EN 16931.
 * - fr-b2b: France accepts Factur-X (fr.json B2B: cii, ubl-2.1, factur-x); the French CTC rules (BR-FR Flux 2) add the
 *   SIREN (BR-FR-10), the billing mode BT-23 (BR-FR-08), three mandatory notes (BR-FR-05) and both electronic
 *   addresses (BR-FR-12/13).
 * - eu-b2b: a plain EN 16931 invoice (Factur-X EN 16931 profile), checked against the EN 16931 CII rules only.
 */
export type AudienceId = 'de-b2b' | 'de-b2g' | 'fr-b2b' | 'eu-b2b';

export interface RequiredField {
  /** The editor's field key (see validation/fieldKeys.ts). */
  key: string;
  /** The official rule that makes it mandatory for this audience; test/ui-audience.test.ts proves it fires. */
  rule: string;
}

export interface Audience {
  id: AudienceId;
  /** Factur-X profile written into the PDF and the XML (BT-24). */
  profile: FacturXProfile;
  /** Country rule layer passed to @conformo/validate; undefined = EN 16931 only. */
  country?: 'DE' | 'FR';
  /** The standard named in the verdict, e.g. "XRechnung 3.0". Plain words, the same in every UI language. */
  standard: string;
  /** Countries pre-filled for seller and buyer on a fresh invoice ('' = let the user choose). */
  defaultSellerCountry: string;
  defaultBuyerCountry: string;
  /** Fields this audience's official rules make mandatory beyond EN 16931's own (BR-01..BR-16, checked by the core). */
  required: RequiredField[];
}

export const AUDIENCES: Record<AudienceId, Audience> = {
  'de-b2b': {
    id: 'de-b2b', profile: 'en16931', standard: 'ZUGFeRD (EN 16931)',
    defaultSellerCountry: 'DE', defaultBuyerCountry: 'DE', required: [],
  },
  'de-b2g': {
    id: 'de-b2g', profile: 'xrechnung', country: 'DE', standard: 'XRechnung 3.0',
    defaultSellerCountry: 'DE', defaultBuyerCountry: 'DE',
    required: [
      { key: 'buyerReference', rule: 'BR-DE-15' },
      { key: 'seller.contact.name', rule: 'BR-DE-5' },
      { key: 'seller.contact.phone', rule: 'BR-DE-6' },
      { key: 'seller.contact.email', rule: 'BR-DE-7' },
      { key: 'seller.city', rule: 'BR-DE-3' },
      { key: 'seller.postcode', rule: 'BR-DE-4' },
      { key: 'buyer.city', rule: 'BR-DE-8' },
      { key: 'buyer.postcode', rule: 'BR-DE-9' },
      { key: 'seller.electronicAddress', rule: 'PEPPOL-EN16931-R020' },
      { key: 'buyer.electronicAddress', rule: 'PEPPOL-EN16931-R010' },
    ],
  },
  'fr-b2b': {
    id: 'fr-b2b', profile: 'en16931', country: 'FR', standard: 'Factur-X (EN 16931) + BR-FR',
    defaultSellerCountry: 'FR', defaultBuyerCountry: 'FR',
    required: [
      { key: 'seller.legalId', rule: 'BR-FR-10' },
      { key: 'businessProcess', rule: 'BR-FR-08' },
      { key: 'notes.AAB', rule: 'BR-FR-05' },
      { key: 'notes.PMD', rule: 'BR-FR-05' },
      { key: 'notes.PMT', rule: 'BR-FR-05' },
      { key: 'seller.electronicAddress', rule: 'BR-FR-13' },
      { key: 'buyer.electronicAddress', rule: 'BR-FR-12' },
    ],
  },
  'eu-b2b': {
    id: 'eu-b2b', profile: 'en16931', standard: 'EN 16931',
    defaultSellerCountry: '', defaultBuyerCountry: '', required: [],
  },
};

export const AUDIENCE_ORDER: AudienceId[] = ['de-b2b', 'de-b2g', 'fr-b2b', 'eu-b2b'];

export function isAudienceId(v: unknown): v is AudienceId {
  return typeof v === 'string' && v in AUDIENCES;
}

/** First guess from the browser language; the user picks explicitly with one click. */
export function defaultAudience(languages: readonly string[]): AudienceId {
  const primary = (languages[0] ?? '').toLowerCase();
  if (primary.startsWith('de')) return 'de-b2b';
  if (primary.startsWith('fr')) return 'fr-b2b';
  return 'eu-b2b';
}

/** The three notes BR-FR-05 requires (BT-21 subject codes AAB, PMD, PMT), pre-filled with the usual French wording
 * the seller can edit. French: the invoice goes to a French business. */
export const FR_NOTE_DEFAULTS: Record<'AAB' | 'PMD' | 'PMT', string> = {
  AAB: "Pas d'escompte pour paiement anticipé.",
  PMD: "En cas de retard de paiement, pénalités au taux de trois fois le taux d'intérêt légal.",
  PMT: 'Indemnité forfaitaire pour frais de recouvrement : 40 EUR.',
};

export function noteText(invoice: Invoice, code: string): string {
  return invoice.notes?.find((n) => n.subjectCode === code)?.text ?? '';
}

export function setNote(invoice: Invoice, code: string, text: string): Invoice {
  const others = (invoice.notes ?? []).filter((n) => n.subjectCode !== code);
  const notes = text ? [...others, { text, subjectCode: code }] : others;
  return { ...invoice, notes: notes.length ? notes : undefined };
}

/** Switching audience fills what the new rules need with sensible, visible defaults and never deletes what the
 * user typed. */
/** Sets the seller country; standard-rated lines still on the old country's default rate (or the invalid 0 %) follow
 * the new country's standard rate (BR-S-05 rejects S with 0 %). A rate the user typed is kept. */
export function withSellerCountry(invoice: Invoice, country: string): Invoice {
  const before = standardRate(invoice.seller.country);
  const after = standardRate(country);
  const lines = invoice.lines.map((l) =>
    l.taxCategory === 'S' && after !== undefined && (l.taxRate === 0 || l.taxRate === before) ? { ...l, taxRate: after } : l);
  return { ...invoice, seller: { ...invoice.seller, country }, lines };
}

export function applyAudience(invoice: Invoice, audience: Audience): Invoice {
  let next: Invoice = { ...invoice, seller: { ...invoice.seller }, buyer: { ...invoice.buyer } };
  if (!next.seller.country && audience.defaultSellerCountry) next = withSellerCountry(next, audience.defaultSellerCountry);
  if (!next.buyer.country && audience.defaultBuyerCountry) next.buyer.country = audience.defaultBuyerCountry;
  if (audience.id === 'fr-b2b') {
    for (const code of ['AAB', 'PMD', 'PMT'] as const) if (!noteText(next, code)) next = setNote(next, code, FR_NOTE_DEFAULTS[code]);
    if (next.seller.legalId && !next.seller.legalIdScheme) next.seller.legalIdScheme = '0002';
  }
  return next;
}
