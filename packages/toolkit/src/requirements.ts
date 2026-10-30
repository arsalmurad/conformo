import { getCountry, countries } from '@conformo/compliance-data';
import type { CountryCompliance, FormatId as DatasetFormat } from '@conformo/compliance-data';

/** What Conformo itself does per format named in the compliance dataset. Kept next to the dataset lookup so a
 * requirement is never shown without saying whether this toolkit can meet it. */
export const FORMAT_SUPPORT: Record<DatasetFormat, { generate: boolean; read: boolean; validate: boolean; note: string }> = {
  cii: { generate: true, read: true, validate: true, note: 'EN 16931 CII' },
  'factur-x': { generate: true, read: true, validate: true, note: 'Hybrid PDF/A-3 with embedded CII; EN 16931 and EXTENDED profiles' },
  zugferd: { generate: true, read: true, validate: true, note: 'ZUGFeRD 2.x = Factur-X; EN 16931, XRECHNUNG and EXTENDED profiles' },
  xrechnung: { generate: true, read: true, validate: true, note: 'XRechnung 3.x, CII and UBL, checked with the KoSIT rules' },
  'ubl-2.1': { generate: true, read: true, validate: true, note: 'UBL 2.1 Invoice and CreditNote' },
  'peppol-bis-3.0': { generate: true, read: true, validate: true, note: 'Documents only; Conformo does not transmit over the Peppol network' },
  fatturapa: { generate: false, read: false, validate: false, note: 'Not supported: no FatturaPA serializer, reader or validator, and no SdI transmission' },
  'ksef-fa': { generate: false, read: false, validate: false, note: 'Not supported: no KSeF FA(3) serializer, reader or validator, and no KSeF submission' },
  facturae: { generate: false, read: false, validate: false, note: 'Not supported: no Facturae serializer, reader or validator' },
  other: { generate: false, read: false, validate: false, note: 'Not supported' },
};

export interface CountryRequirements extends CountryCompliance {
  /** For each required format of each mandate: can this toolkit produce / read / validate it? */
  conformoSupport: Record<string, (typeof FORMAT_SUPPORT)[DatasetFormat]>;
}

export const SUPPORTED_COUNTRIES: string[] = countries.map((c) => c.country);

/** Mandates, dates, thresholds and sources for a country, from the sourced dataset, plus what Conformo supports. */
export function getRequirements(country: string): CountryRequirements | undefined {
  const c = getCountry(country);
  if (!c) return undefined;
  const conformoSupport: CountryRequirements['conformoSupport'] = {};
  for (const m of c.mandates) for (const f of m.requiredFormats) conformoSupport[f] = FORMAT_SUPPORT[f];
  return { ...c, conformoSupport };
}
