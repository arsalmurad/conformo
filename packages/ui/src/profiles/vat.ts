/** EU VAT identifier formats, keyed by the two-letter prefix actually used
 * on the number (Greece is the one EU country whose VAT prefix, "EL",
 * differs from its ISO country code, "GR" — see BR-CO-09's own note on this
 * in packages/validate/src/messages/en.ts). Patterns are the "digits after
 * the prefix" shape per the EU's own VAT number format reference; this
 * catches transposed/missing digits, not whether the number is actually
 * registered (that needs a VIES lookup, which needs a server — out of scope
 * for a no-account, no-server tool). */
const VAT_FORMAT: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^0?\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/, // Greece
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^\d{7}[A-Z]{1,2}$|^\d[A-Z+*]\d{5}[A-Z]$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  // Common non-EU trading partners this project's fixtures already touch.
  GB: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  CH: /^\d{9}$/,
};

export interface VatCheck {
  valid: boolean;
  reason?: string;
}

/** `vatId` is the full identifier including its two-letter prefix, e.g.
 * "FR32123456789" — what BT-31/BT-48 actually hold. */
export function checkVatFormat(vatId: string): VatCheck {
  const value = vatId.replace(/\s+/g, '').toUpperCase();
  const prefix = value.slice(0, 2);
  const digits = value.slice(2);
  const pattern = VAT_FORMAT[prefix];
  if (!pattern) {
    // Not a country we have a pattern for (could be a non-EU VAT number, or
    // a typo'd prefix) — don't claim it's wrong when we just don't know.
    return { valid: true };
  }
  if (!pattern.test(digits)) {
    return { valid: false, reason: `doesn't match the ${prefix} VAT number format` };
  }
  return { valid: true };
}
