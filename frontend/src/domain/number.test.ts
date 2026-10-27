import { describe, expect, it } from 'vitest';
import { MAX_DIGITS, countDigits, formatNumber, parseEntry } from './number';

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [42, '42'],
    [-3.5, '-3.5'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333'],
    [123456789012, '123456789012'],
    [1e15, '1e+15'],
    [1.5e20, '1.5e+20'],
    [-2.25e-7, '-2.25e-7'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it('rejects non-finite values', () => {
    expect(() => formatNumber(Infinity)).toThrow(RangeError);
    expect(() => formatNumber(NaN)).toThrow(RangeError);
  });
});

describe('countDigits', () => {
  it('ignores sign and decimal point', () => {
    expect(countDigits('-12.50')).toBe(4);
  });
});

describe('parseEntry', () => {
  it.each([
    ['42', '42'],
    ['  -3.75 ', '-3.75'],
    ['+8', '8'],
    ['−8', '-8'],
    ['.5', '0.5'],
    ['-.5', '-0.5'],
    ['007', '7'],
    ['1 000 000', '1000000'],
    ['12.', '12.'],
  ])('accepts %j as %j', (text, entry) => {
    expect(parseEntry(text)).toEqual({ ok: true, entry });
  });

  it.each(['', 'abc', '1e5', '1,5', '2+2', '--1', '.', 'Infinity'])('rejects %j', text => {
    expect(parseEntry(text)).toEqual({ ok: false, message: 'Paste a plain number, like 42 or -3.75.' });
  });

  it('rejects numbers longer than the digit limit', () => {
    const result = parseEntry('9'.repeat(MAX_DIGITS + 1));
    expect(result).toEqual({ ok: false, message: `Numbers can have at most ${MAX_DIGITS} digits.` });
  });
});
