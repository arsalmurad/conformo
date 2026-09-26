/**
 * Presentation-only locale formatting for the PDF template. Dates, number
 * formatting and currency display follow the invoice's country and
 * currency, not the browser's US default: a EUR invoice to a French buyer
 * should not render 09/23/2026.
 *
 * Deliberately separate from packages/core/src/money.ts: that module's
 * `toMajor()` produces the exact, locale-independent decimal text the XML
 * and the money math need (money is always integer minor units, never a
 * float) and must never change. This module only decides how that same
 * value is *drawn* on the page.
 *
 * `Intl.DateTimeFormat`/`Intl.NumberFormat` are pure functions of their
 * input — no clock, no randomness — so this doesn't touch invariant 5
 * (deterministic output) on the machine that builds the PDF. The one caveat
 * worth naming: their exact output (e.g. which Unicode space character is
 * used as a thousands separator) depends on the JS engine's bundled ICU
 * data, which is why the determinism *gate* (build twice, same machine) is
 * what CI actually checks — cross-machine byte-identity was never proven
 * before this file existed either, since fonts and pdf-lib's own output
 * already depend on the toolchain in the same way.
 */

/** Maps a party's country to a BCP-47 locale for formatting dates and
 * numbers the way that country actually writes them. Deliberately not
 * exhaustive — falls back to a non-US default (English-but-day-first)
 * rather than the browser's own locale, so an invoice's appearance depends
 * on the invoice, not on who happens to be viewing it. */
const LOCALE_BY_COUNTRY: Record<string, string> = {
  FR: 'fr-FR', DE: 'de-DE', BE: 'nl-BE', IT: 'it-IT', NL: 'nl-NL',
  PL: 'pl-PL', ES: 'es-ES', PT: 'pt-PT', AT: 'de-AT', CH: 'de-CH',
  IE: 'en-IE', GB: 'en-GB', US: 'en-US',
};
const DEFAULT_LOCALE = 'en-GB';

/** The buyer is who actually reads this invoice day to day; the seller's
 * country is the fallback for a self-addressed proforma or a buyer whose
 * country isn't in the map above. */
export function localeForInvoice(buyerCountry?: string, sellerCountry?: string): string {
  return LOCALE_BY_COUNTRY[buyerCountry ?? ''] ?? LOCALE_BY_COUNTRY[sellerCountry ?? ''] ?? DEFAULT_LOCALE;
}

/** ISO yyyy-mm-dd -> a locale-correct short date, e.g. "24/09/2026" for
 * fr-FR, "9/24/2026" for en-US. Parsed as UTC noon-agnostic date parts
 * (never `new Date(iso)` directly), so no local timezone can shift the
 * calendar day the invoice actually states. */
export function formatInvoiceDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** Minor units -> a locale-correct decimal string, e.g. "1234,56" for
 * fr-FR vs "1234.56" for en-US. Grouping is deliberately off (see below), so
 * only the decimal mark changes; callers still append the ISO currency code
 * themselves (an invoice states "EUR", not "€", so the amount reads the same
 * regardless of which country's locale renders it).
 *
 * `useGrouping: false` is deliberate, not an oversight: packages/parse/src/
 * pdf/visibleTotals.ts re-reads this exact text off the rendered page to
 * cross-check it against the embedded XML (the visible-totals fraud check).
 * A thousands separator would be ambiguous to
 * parse back out — several locales group with a plain or non-breaking space,
 * which pdfjs's own text extraction already collapses and re-inserts between
 * unrelated text runs, making a grouping space indistinguishable from word
 * spacing. The decimal mark alone (comma or period) has no such ambiguity,
 * so that's the only thing this localizes. */
export function formatInvoiceAmount(minor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(minor / 100);
}
