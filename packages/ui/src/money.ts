import { fromMajor, toMajor } from '@conformo/core';
import type { Lang } from './i18n/strings.js';

/**
 * Amounts are shown and typed the way people write them ("1.234,50" in German, "1,234.50" in English), but every
 * conversion goes through @conformo/core's exact-decimal toMajor/fromMajor: no float ever touches a cent.
 */
const SEP: Record<Lang, { group: string; decimal: string }> = {
  en: { group: ',', decimal: '.' },
  de: { group: '.', decimal: ',' },
};

function group(intPart: string, sep: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** 123450 -> "1.234,50" (de) / "1,234.50" (en). Accepts fractional minor units (sub-cent unit prices, BT-146). */
export function formatAmount(minor: number, lang: Lang): string {
  const s = toMajor(minor);
  const neg = s.startsWith('-');
  const [i, f] = (neg ? s.slice(1) : s).split('.');
  const { group: g, decimal: d } = SEP[lang];
  return `${neg ? '−' : ''}${group(i!, g)}${f ? d + f : ''}`;
}

export function formatMoney(minor: number, currency: string, lang: Lang): string {
  return lang === 'de' ? `${formatAmount(minor, lang)} ${currency}` : `${currency} ${formatAmount(minor, lang)}`;
}

/** Normalizes what someone typed to a plain decimal string, or undefined if it is not a number.
 * "1.234,5" (de) -> "1234.5", "1,234.5" (en) -> "1234.5", "120" -> "120", "0,5" -> "0.5" in either language. */
export function normalizeDecimal(text: string, lang: Lang): string | undefined {
  let t = text.trim().replace(/\s/g, '').replace(/^−/, '-');
  if (!t) return undefined;
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    // The separator that comes last is the decimal one.
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const grp = dec === ',' ? '.' : ',';
    t = t.split(grp).join('').replace(dec, '.');
  } else if (hasComma) {
    // A lone comma is a decimal comma, unless it is clearly an English thousands separator ("1,234").
    t = lang === 'en' && /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (hasDot && lang === 'de' && /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  return /^-?\d*\.?\d+$|^-?\d+\.$/.test(t) ? t.replace(/\.$/, '') : undefined;
}

export function parseAmount(text: string, lang: Lang): number | undefined {
  const n = normalizeDecimal(text, lang);
  return n === undefined ? undefined : fromMajor(n);
}

/** Quantities and VAT rates are plain decimals in the model (not money). */
export function parseDecimal(text: string, lang: Lang): number | undefined {
  const n = normalizeDecimal(text, lang);
  return n === undefined ? undefined : Number(n);
}

export function formatDecimal(n: number, lang: Lang): string {
  if (!Number.isFinite(n)) return '';
  const s = String(n);
  return lang === 'de' ? s.replace('.', ',') : s;
}
