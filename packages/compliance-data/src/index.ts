/**
 * Node entry: reads every data/*.json file and validates it against the
 * schema (see validate.ts) before exporting it. Node-only (uses node:fs) on
 * purpose — this package's consumers today are all build-time Node tooling
 * (tools/generate-docs.ts, tools/generate-readme-matrix.ts, and any external
 * npm consumer), not the browser app. A future browser feature that wants
 * this data at runtime should fetch the published plain JSON file (see
 * tools/build-compliance-data.ts) rather than needing this package bundled.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertCountryCompliance } from './validate.js';
import type { ComplianceDataset, CountryCompliance } from './types.js';

export * from './types.js';
export { assertCountryCompliance, ComplianceDataError } from './validate.js';

const dataDir = fileURLToPath(new URL('./data/', import.meta.url));

function loadCountries(): CountryCompliance[] {
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => {
    const raw = JSON.parse(readFileSync(`${dataDir}${file}`, 'utf-8')) as CountryCompliance;
    assertCountryCompliance(raw, file);
    return raw;
  });
}

export const countries: CountryCompliance[] = loadCountries();

/** The most recent `lastVerified` across every row, not `new Date()` — this
 * value ends up in a published artifact (tools/build-compliance-data.ts), and
 * a clock reading "now" on every import would make that artifact
 * non-reproducible from the same data (the same determinism an invoice
 * document itself needs, applied here too). */
function latestVerifiedDate(list: CountryCompliance[]): string {
  return list.reduce((latest, c) => (c.lastVerified > latest ? c.lastVerified : latest), '0000-00-00');
}

export const dataset: ComplianceDataset = {
  schemaVersion: 1,
  generatedAt: latestVerifiedDate(countries),
  countries,
};

export function getCountry(iso2: string): CountryCompliance | undefined {
  return countries.find((c) => c.country === iso2.toUpperCase());
}
