/**
 * ISO 3166-1 alpha-2 codes (BT-40 / BT-55 need the code; people know the name). Names come from the browser's own
 * Intl.DisplayNames in the UI language, so there is no translation table to maintain.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

/**
 * Standard VAT rates of the EU member states (European Commission, "VAT rates applied in the Member States", taxation
 * and customs union), used only as the default rate of a new standard-rated line (category S, BT-152). BR-S-05 rejects
 * S with 0%, which was the old default. The user can always change the rate.
 */
export const STANDARD_VAT_RATE: Record<string, number> = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21, DE: 19, DK: 25, EE: 24, ES: 21, FI: 25.5, FR: 20, GR: 24, HR: 25, HU: 27,
  IE: 23, IT: 22, LT: 21, LU: 17, LV: 21, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SE: 25, SI: 22, SK: 23,
};

export function standardRate(country: string | undefined): number | undefined {
  return country ? STANDARD_VAT_RATE[country] : undefined;
}

export interface CountryOption {
  code: string;
  name: string;
}

const cache = new Map<string, CountryOption[]>();

export function countryOptions(lang: string): CountryOption[] {
  const hit = cache.get(lang);
  if (hit) return hit;
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames([lang], { type: 'region' });
  } catch {
    names = undefined;
  }
  const list = CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, lang));
  cache.set(lang, list);
  return list;
}

export function countryName(code: string, lang: string): string {
  return countryOptions(lang).find((c) => c.code === code)?.name ?? code;
}

/** Resolves what someone typed ("Deutschland", "germany", "DE") to a code, or undefined. */
export function resolveCountry(text: string, lang: string): string | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  const list = countryOptions(lang);
  const byCode = list.find((c) => c.code.toLowerCase() === t);
  if (byCode) return byCode.code;
  const exact = list.find((c) => c.name.toLowerCase() === t || `${c.name} (${c.code})`.toLowerCase() === t);
  if (exact) return exact.code;
  // Names in the other UI language too, so "Germany" works with the German UI.
  for (const other of ['en', 'de', 'fr']) {
    if (other === lang) continue;
    const m = countryOptions(other).find((c) => c.name.toLowerCase() === t);
    if (m) return m.code;
  }
  const starts = list.filter((c) => c.name.toLowerCase().startsWith(t));
  return starts.length === 1 ? starts[0]!.code : undefined;
}
