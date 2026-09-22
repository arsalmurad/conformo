/**
 * Which serialized formats each fixture must validate against. Shared between
 * tools/build-fixtures.ts (which produces the XML) and tools/validate.py (which
 * checks it), so the two cannot silently drift apart.
 *
 * 'negative' fixtures are expected to FAIL Schematron validation: they exist to
 * prove the validation pipeline actually rejects a wrong invoice, the same way
 * test/pdfa-traps.test.ts proves a regression guard actually guards.
 */
export type Target = 'cii-en16931' | 'ubl-en16931' | 'cii-xrechnung' | 'ubl-xrechnung' | 'ubl-peppol';

export interface FixtureSpec {
  file: string;
  targets: Target[];
  negative?: boolean;
}

export const FIXTURES: FixtureSpec[] = [
  { file: 'sample-invoice.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'reverse-charge-ae.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'intra-community-k.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'zero-rated-z.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'exempt-e-vatex.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'not-subject-to-vat-o.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'multi-rate-allowances.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'fiscal-representative.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'tax-currency.json', targets: ['cii-en16931', 'ubl-en16931'] },
  { file: 'credit-note.json', targets: ['cii-en16931', 'ubl-en16931', 'cii-xrechnung', 'ubl-xrechnung'] },
  { file: 'xrechnung-public-sector.json', targets: ['cii-en16931', 'ubl-en16931', 'cii-xrechnung', 'ubl-xrechnung'] },
  { file: 'peppol-belgium-full.json', targets: ['ubl-en16931', 'ubl-peppol'] },
  // BR-Z-10 forbids a VAT exemption reason on a zero-rated line. This fixture is
  // the negative control: validate.py asserts the Schematron actually flags it.
  // UBL only: empirically, the EN16931 Schematron for CII bundled in the pip
  // `factur-x` package does not implement BR-Z-10 (confirmed by running this
  // exact fixture through it), while the UBL one does. That is a real gap in a
  // third-party artefact, recorded in the project's own tracker, not something to route
  // around by testing a format where the gap is invisible.
  { file: 'negative/z-with-vatex.json', targets: ['ubl-en16931'], negative: true },
];
