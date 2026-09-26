import { useEffect, useState } from 'react';
import { BASE_URL } from './baseUrl.js';

export interface ComplianceCountry {
  country: string;
  name: string;
}

/** Fetches the {country, name} list scripts/copy-compliance-data.mjs writes
 * from packages/compliance-data's own source at build time — so the "Country
 * rules" selector grows automatically when a country is added to the
 * dataset, without a matching UI change. */
export function useComplianceCountries(): ComplianceCountry[] {
  const [countries, setCountries] = useState<ComplianceCountry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_URL}compliance-countries.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ComplianceCountry[]) => { if (!cancelled) setCountries(data); })
      .catch(() => { /* the selector just falls back to EN 16931 + France */ });
    return () => { cancelled = true; };
  }, []);
  return countries;
}
