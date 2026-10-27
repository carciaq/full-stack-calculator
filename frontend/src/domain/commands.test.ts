import { describe, expect, it } from 'vitest';
import { commandForKey } from './commands';

describe('commandForKey', () => {
  it('maps digits', () => {
    expect(commandForKey('7')).toEqual({ type: 'digit', digit: '7' });
  });

  it.each([
    ['+', { type: 'operator', operation: 'add' }],
    ['-', { type: 'operator', operation: 'subtract' }],
    ['*', { type: 'operator', operation: 'multiply' }],
    ['x', { type: 'operator', operation: 'multiply' }],
    ['/', { type: 'operator', operation: 'divide' }],
    ['^', { type: 'operator', operation: 'power' }],
    ['%', { type: 'operator', operation: 'percentage' }],
    ['r', { type: 'unary', operation: 'sqrt' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    [',', { type: 'decimal' }],
    ['Backspace', { type: 'backspace' }],
    ['Escape', { type: 'clear' }],
    ['n', { type: 'toggleSign' }],
  ])('maps %j', (key, command) => {
    expect(commandForKey(key)).toEqual(command);
  });

  it('ignores unrelated keys', () => {
    expect(commandForKey('a')).toBeNull();
    expect(commandForKey('Tab')).toBeNull();
  });
});
