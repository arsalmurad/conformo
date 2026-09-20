/**
 * Money is always integer minor units. Floats are banned in this codebase:
 * EN 16931 BR-CO-* rules reject an invoice whose totals are off by one cent,
 * and float arithmetic will produce that error eventually.
 */
export type Minor = number;

export const fromMajor = (major: number | string): Minor =>
  Math.round(Number(major) * 100);

export const toMajor = (minor: Minor): string => (minor / 100).toFixed(2);

/** EN 16931 default: half-up on the absolute value, sign preserved. */
export const roundHalfUp = (x: number): Minor =>
  x < 0 ? -Math.round(-x) : Math.round(x);
