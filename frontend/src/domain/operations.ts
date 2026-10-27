import { formatNumber } from './number';

export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage';
export type UnaryOperation = 'sqrt';
export type Operation = BinaryOperation | UnaryOperation;

interface OperationInfo {
  /** Symbol printed on the key, the display and the tape. */
  symbol: string;
  /** Accessible name of the key. */
  label: string;
  arity: 1 | 2;
}

export const OPERATIONS: Record<Operation, OperationInfo> = {
  add: { symbol: '+', label: 'Add', arity: 2 },
  subtract: { symbol: '−', label: 'Subtract', arity: 2 },
  multiply: { symbol: '×', label: 'Multiply', arity: 2 },
  divide: { symbol: '÷', label: 'Divide', arity: 2 },
  power: { symbol: '^', label: 'Power', arity: 2 },
  percentage: { symbol: '% of', label: 'Percent of', arity: 2 },
  sqrt: { symbol: '√', label: 'Square root', arity: 1 },
};

export function isUnary(operation: Operation): operation is UnaryOperation {
  return OPERATIONS[operation].arity === 1;
}

/** Renders an operation the way it is printed on the tape, e.g. "12 × 3" or "√16". */
export function formatExpression(operation: Operation, operands: readonly number[]): string {
  const { symbol } = OPERATIONS[operation];
  const [a = 0, b = 0] = operands;
  if (isUnary(operation)) {
    return `${symbol}${formatNumber(a)}`;
  }
  return `${formatNumber(a)} ${symbol} ${formatNumber(b)}`;
}
