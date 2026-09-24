import { describe, it, expect } from 'vitest';
import { fromMajor, toMajor, roundHalfUp, mulRound, decimalToString, lineNet } from '@verinvoice/core';

describe('money is exact: floats never decide a cent (invariant 1)', () => {
  it('regression: 0.009 x 15.00 is 0.135, which rounds half up to 0.14, not the float 0.13', () => {
    // 0.009 * 1500 === 13.499999999999998 in binary floating point.
    expect(0.009 * 1500).toBeLessThan(13.5);
    expect(lineNet({ quantity: 0.009, unitPriceMinor: 1500 })).toBe(14);
  });

  it('agrees with plain integer arithmetic for every 3-decimal quantity x price tried', () => {
    // Independent reference: quantity n/1000 x price p = n*p/1000, all integers, half up.
    const prices = [...Array.from({ length: 40 }, (_, i) => i + 1), 375, 750, 1500, 1750, 9999];
    let checked = 0;
    for (let n = 1; n <= 9999; n++) {
      for (const p of prices) {
        const expected = Math.floor((n * p + 500) / 1000);
        const got = lineNet({ quantity: n / 1000, unitPriceMinor: p });
        if (got !== expected) {
          throw new Error(`quantity ${n / 1000} x ${p}: expected ${expected}, got ${got}`);
        }
        checked++;
      }
    }
    expect(checked).toBe(9999 * prices.length);
  });

  it('rounds half away from zero, preserving sign', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(mulRound(0.5, 1)).toBe(1);
    expect(mulRound(-0.5, 1)).toBe(-1);
    expect(mulRound(0.4999, 1)).toBe(0);
  });

  it('fromMajor is exact and never returns negative zero', () => {
    expect(fromMajor(1.005)).toBe(101);           // Math.round(1.005 * 100) is 100
    expect(fromMajor('19.99')).toBe(1999);
    expect(fromMajor(-0.005)).toBe(-1);
    expect(Object.is(fromMajor(-0.001), 0)).toBe(true);
    expect(fromMajor(0.1) + fromMajor(0.2)).toBe(30);
  });

  it('computes a VAT amount exactly for rates that are not binary-friendly', () => {
    // 19.6% of 1000.00 is 196.00. As floats, 100000 * 19.6 / 100 is 19600.000000000004 territory.
    expect(mulRound(100000, 19.6, 100)).toBe(19600);
    expect(mulRound(2500, 7.7, 100)).toBe(193);   // 192.5 half up
  });

  it('toMajor formats with integer arithmetic, including negatives and large values', () => {
    expect(toMajor(0)).toBe('0.00');
    expect(toMajor(5)).toBe('0.05');
    expect(toMajor(-5)).toBe('-0.05');
    expect(toMajor(123456789012)).toBe('1234567890.12');
    expect(() => toMajor(1.5)).toThrow(RangeError);
  });

  it('decimalToString never emits exponent notation, which is not a valid xs:decimal', () => {
    expect(String(1e-7)).toBe('1e-7');
    expect(decimalToString(1e-7)).toBe('0.0000001');
    expect(decimalToString(1e21)).toBe('1000000000000000000000');
    expect(decimalToString(12)).toBe('12');
    expect(decimalToString('1.50')).toBe('1.5');
    expect(decimalToString(-0.25)).toBe('-0.25');
    expect(decimalToString(0)).toBe('0');
  });

  it('rejects input that is not a finite decimal instead of computing with it', () => {
    expect(() => mulRound(NaN, 1)).toThrow(RangeError);
    expect(() => mulRound(Infinity, 1)).toThrow(RangeError);
    expect(() => mulRound('12abc', 1)).toThrow(RangeError);
    expect(() => mulRound('', 1)).toThrow(RangeError);
  });

  it('refuses an amount beyond the safe integer range rather than silently losing cents', () => {
    expect(() => mulRound(Number.MAX_SAFE_INTEGER, 10)).toThrow(RangeError);
  });
});
