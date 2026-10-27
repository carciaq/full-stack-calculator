import { describe, expect, it } from 'vitest';
import { formatExpression, isUnary } from './operations';

describe('formatExpression', () => {
  it('prints binary operations with their symbol', () => {
    expect(formatExpression('multiply', [12, 3])).toBe('12 × 3');
    expect(formatExpression('percentage', [15, 80])).toBe('15 % of 80');
    expect(formatExpression('subtract', [0.1, -2])).toBe('0.1 − -2');
  });

  it('prints unary operations as a prefix', () => {
    expect(formatExpression('sqrt', [16])).toBe('√16');
  });
});

describe('isUnary', () => {
  it('identifies square root as the only unary operation', () => {
    expect(isUnary('sqrt')).toBe(true);
    expect(isUnary('add')).toBe(false);
  });
});
