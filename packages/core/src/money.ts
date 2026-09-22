/**
 * Money is always integer minor units. Floats are banned in this codebase:
 * EN 16931 BR-CO-* rules reject an invoice whose totals are off by one cent,
 * and float arithmetic will produce that error eventually.
 *
 * The float ban covers arithmetic, not input. A quantity such as 0.009 arrives
 * as a JS number, and 0.009 * 1500 is 13.499999999999998 in binary floating
 * point, which rounds to 13 where the invoice-correct half-up answer is 14. So
 * every multiplication here goes through exact BigInt decimals. A JS number is
 * read by its shortest round-trip text (String(0.009) is "0.009"), which is the
 * decimal the user typed, not the nearest binary neighbour.
 */
export type Minor = number;

interface Decimal {
  /** value = int / 10^scale */
  int: bigint;
  scale: number;
}

function parseDecimal(x: number | string): Decimal {
  if (typeof x === 'number' && !Number.isFinite(x)) {
    throw new RangeError(`not a finite number: ${x}`);
  }
  const text = typeof x === 'number' ? String(x) : x.trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m || ((m[2] ?? '') === '' && (m[3] ?? '') === '')) {
    throw new RangeError(`not a decimal number: ${JSON.stringify(x)}`);
  }
  const frac = m[3] ?? '';
  let int = BigInt(`${m[2] ?? ''}${frac}` || '0');
  let scale = frac.length - (m[4] ? parseInt(m[4], 10) : 0);
  if (scale < 0) {
    int *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { int: m[1] === '-' ? -int : int, scale };
}

/** Integer division rounding half away from zero: EN 16931's default rounding. */
function divRound(num: bigint, den: bigint): bigint {
  const negative = (num < 0n) !== (den < 0n);
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

function toMinor(v: bigint): Minor {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError('amount exceeds the safe integer range');
  return n;
}

/**
 * round_half_up(a * b / divisor), computed exactly. Both factors may be JS numbers
 * or decimal strings. This is the one place a quantity, a price or a VAT rate is
 * multiplied: BT-131 (line net), BT-117 (VAT amount) and BT-92/99 percentages.
 */
export function mulRound(a: number | string, b: number | string, divisor: number = 1): Minor {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  return toMinor(divRound(x.int * y.int, 10n ** BigInt(x.scale + y.scale) * BigInt(divisor)));
}

/** "19.99" or 19.99 -> 1999. Half away from zero, exact for any number of decimals. */
export const fromMajor = (major: number | string): Minor => mulRound(major, 100);

/** 1999 -> "19.99". Integer arithmetic only, so it cannot drift on large amounts. */
export function toMajor(minor: Minor): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`not an integer amount: ${minor}`);
  const abs = Math.abs(minor);
  return `${minor < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * A number as plain decimal text, never exponent notation. String(1e-7) is "1e-7",
 * which is not a valid xs:decimal, so serializers use this for quantities and rates.
 */
export function decimalToString(x: number | string): string {
  const { int, scale } = parseDecimal(x);
  const negative = int < 0n;
  let digits = (negative ? -int : int).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    const whole = digits.slice(0, digits.length - scale);
    const frac = digits.slice(digits.length - scale).replace(/0+$/, '');
    digits = frac ? `${whole}.${frac}` : whole;
  }
  return negative && digits !== '0' ? `-${digits}` : digits;
}

/** Half away from zero on a decimal value: 2.5 -> 3, -2.5 -> -3. */
export const roundHalfUp = (x: number): Minor => mulRound(x, 1);
