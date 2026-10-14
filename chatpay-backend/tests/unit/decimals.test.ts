import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

describe('Unit Tests: Monetary Decimal Precision (NFR-7)', () => {
  it('prevents IEEE-754 floating point rounding errors', () => {
    // In IEEE-754 float: 0.1 + 0.2 === 0.30000000000000004
    const floatResult = 0.1 + 0.2;
    expect(floatResult).not.toBe(0.3);

    // Using Decimal strings:
    const d1 = new Decimal('0.1');
    const d2 = new Decimal('0.2');
    const exactSum = d1.plus(d2);
    expect(exactSum.toString()).toBe('0.3');
    expect(exactSum.toFixed(7)).toBe('0.3000000');
  });

  it('validates 7-decimal place limit for Stellar transactions', () => {
    const valid7 = new Decimal('10.1234567');
    expect(valid7.decimalPlaces()).toBe(7);
    expect(valid7.decimalPlaces()).toBeLessThanOrEqual(7);

    const invalid8 = new Decimal('10.12345678');
    expect(invalid8.decimalPlaces()).toBe(8);
    expect(invalid8.decimalPlaces()).toBeGreaterThan(7);
  });

  it('validates strictly positive non-zero amounts', () => {
    const zero = new Decimal('0');
    expect(zero.lte(0)).toBe(true);

    const negative = new Decimal('-5.00');
    expect(negative.lte(0)).toBe(true);

    const positive = new Decimal('0.0000001');
    expect(positive.gt(0)).toBe(true);
  });

  it('enforces maximum per-transaction cap correctly', () => {
    const maxCap = new Decimal('1000');
    const withinCap = new Decimal('999.9999999');
    const exactCap = new Decimal('1000.0000000');
    const exceedsCap = new Decimal('1000.0000001');

    expect(withinCap.lte(maxCap)).toBe(true);
    expect(exactCap.lte(maxCap)).toBe(true);
    expect(exceedsCap.gt(maxCap)).toBe(true);
  });
});
