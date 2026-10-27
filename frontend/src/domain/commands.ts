import type { BinaryOperation, UnaryOperation } from './operations';

/** Everything a person can ask the calculator to do, from the keypad or the keyboard. */
export type Command =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operation: BinaryOperation }
  | { type: 'unary'; operation: UnaryOperation }
  | { type: 'equals' }
  | { type: 'backspace' }
  | { type: 'toggleSign' }
  | { type: 'clear' };

const KEY_COMMANDS: Record<string, Command> = {
  '.': { type: 'decimal' },
  ',': { type: 'decimal' },
  '+': { type: 'operator', operation: 'add' },
  '-': { type: 'operator', operation: 'subtract' },
  '*': { type: 'operator', operation: 'multiply' },
  x: { type: 'operator', operation: 'multiply' },
  '/': { type: 'operator', operation: 'divide' },
  '^': { type: 'operator', operation: 'power' },
  '%': { type: 'operator', operation: 'percentage' },
  r: { type: 'unary', operation: 'sqrt' },
  '=': { type: 'equals' },
  Enter: { type: 'equals' },
  Backspace: { type: 'backspace' },
  Escape: { type: 'clear' },
  Delete: { type: 'clear' },
  n: { type: 'toggleSign' },
};

export function commandForKey(key: string): Command | null {
  if (/^\d$/.test(key)) {
    return { type: 'digit', digit: key };
  }
  return KEY_COMMANDS[key] ?? null;
}
