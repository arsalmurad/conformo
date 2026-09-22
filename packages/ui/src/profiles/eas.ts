/** A curated subset of the EN 16931 electronic address scheme code list
 * (EAS, ISO 6523 + a few EN 16931-specific entries) — the full list runs to
 * hundreds of entries for schemes this tool has no fixture or use case for.
 * "EM" (e-mail) is the implicit default whenever the address contains "@"
 * and no scheme is given — see electronicAddressScheme() in
 * packages/formats/src/xml.ts, which this list deliberately mirrors rather
 * than re-deciding independently. */
export const EAS_CODES: { code: string; label: string }[] = [
  { code: 'EM', label: 'EM — E-mail address' },
  { code: '0088', label: '0088 — EAN/GLN' },
  { code: '0007', label: '0007 — Swedish organization number' },
  { code: '0009', label: '0009 — SIRET (France)' },
  { code: '0060', label: '0060 — DUNS number' },
  { code: '0096', label: '0096 — Danish CVR number' },
  { code: '0130', label: '0130 — Directorates of the European Commission' },
  { code: '0184', label: '0184 — Danish CPR number' },
  { code: '0192', label: '0192 — Norwegian organization number' },
  { code: '0204', label: '0204 — Leitweg-ID (German public sector)' },
  { code: '0208', label: '0208 — Belgian enterprise number' },
  { code: '0210', label: '0210 — Italian fiscal code' },
  { code: '9915', label: '9915 — Austrian VAT number' },
  { code: '9925', label: '9925 — Belgian VAT number' },
  { code: '9930', label: '9930 — German VAT number' },
  { code: '9944', label: '9944 — Dutch VAT number' },
  { code: '9957', label: '9957 — French VAT number' },
];
