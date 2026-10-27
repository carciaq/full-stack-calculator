import { MAX_DIGITS, countDigits, formatNumber } from './number';
import { type BinaryOperation, OPERATIONS, type Operation, type UnaryOperation, formatExpression, isUnary } from './operations';

/** One printed line on the paper tape. */
export type TapeLine =
  | { id: number; expression: string; status: 'ok'; result: string }
  | { id: number; expression: string; status: 'error'; message: string };

export interface CalculatorState {
  /** The number currently being typed or shown, kept as text so "3." and "-0" survive. */
  entry: string;
  /** Left operand waiting for `pendingOperation`. */
  accumulator: number | null;
  pendingOperation: BinaryOperation | null;
  /** When true, the next digit starts a new entry instead of extending the current one. */
  overwrite: boolean;
  /** The last completed expression, shown above the result. */
  lastExpression: string | null;
  status: 'idle' | 'pending';
  error: string | null;
  tape: TapeLine[];
  nextTapeId: number;
}

/** A calculation the API should run, and what the calculator does with the result. */
export interface EvaluationRequest {
  operation: Operation;
  operands: number[];
  /** Operator to carry forward after a chained calculation such as "2 + 3 ×". */
  continueWith: BinaryOperation | null;
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'toggleSign' }
  | { type: 'operator'; operation: BinaryOperation }
  | { type: 'entrySet'; entry: string }
  | { type: 'inputRejected'; message: string }
  | { type: 'clear' }
  | { type: 'clearTape' }
  | { type: 'evaluationStarted' }
  | { type: 'evaluationSucceeded'; request: EvaluationRequest; result: number }
  | { type: 'evaluationFailed'; request: EvaluationRequest; message: string };

export const TAPE_LIMIT = 50;

export const initialState: CalculatorState = {
  entry: '0',
  accumulator: null,
  pendingOperation: null,
  overwrite: false,
  lastExpression: null,
  status: 'idle',
  error: null,
  tape: [],
  nextTapeId: 1,
};

const INPUT_ACTIONS = new Set<CalculatorAction['type']>([
  'digit',
  'decimal',
  'backspace',
  'toggleSign',
  'operator',
  'entrySet',
]);

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  // Input is frozen while a request is in flight so the result can't land on top of new typing.
  if (state.status === 'pending' && INPUT_ACTIONS.has(action.type)) {
    return state;
  }

  switch (action.type) {
    case 'digit': {
      const base = state.overwrite ? '0' : state.entry;
      if (countDigits(base) >= MAX_DIGITS) {
        return { ...state, error: `Numbers can have at most ${MAX_DIGITS} digits.` };
      }
      const entry = base === '0' ? action.digit : base === '-0' ? `-${action.digit}` : base + action.digit;
      return { ...state, entry, overwrite: false, error: null, lastExpression: null };
    }

    case 'decimal': {
      const base = state.overwrite ? '0' : state.entry;
      if (base.includes('.')) {
        return { ...state, error: null };
      }
      return { ...state, entry: `${base}.`, overwrite: false, error: null, lastExpression: null };
    }

    case 'backspace': {
      if (state.overwrite) {
        return { ...state, error: null };
      }
      const trimmed = state.entry.slice(0, -1);
      const entry = trimmed === '' || trimmed === '-' ? '0' : trimmed;
      return { ...state, entry, error: null };
    }

    case 'toggleSign': {
      const entry = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`;
      return { ...state, entry, error: null };
    }

    case 'operator': {
      // Pressing a second operator before typing a number just swaps the operator.
      if (state.pendingOperation && state.overwrite) {
        return { ...state, pendingOperation: action.operation, error: null };
      }
      return {
        ...state,
        accumulator: Number(state.entry),
        pendingOperation: action.operation,
        overwrite: true,
        lastExpression: null,
        error: null,
      };
    }

    case 'entrySet':
      return { ...state, entry: action.entry, overwrite: false, error: null, lastExpression: null };

    case 'inputRejected':
      return { ...state, error: action.message };

    case 'clear':
      return { ...initialState, tape: state.tape, nextTapeId: state.nextTapeId };

    case 'clearTape':
      return { ...state, tape: [] };

    case 'evaluationStarted':
      return { ...state, status: 'pending', error: null };

    case 'evaluationSucceeded': {
      const { request, result } = action;
      const expression = formatExpression(request.operation, request.operands);
      const entry = formatNumber(result);
      const line: TapeLine = { id: state.nextTapeId, expression, status: 'ok', result: entry };
      const base = { ...state, entry, overwrite: true, status: 'idle' as const, error: null, ...appendLine(state, line) };

      if (isUnary(request.operation)) {
        // A unary result replaces the entry but keeps any calculation in progress, so "9 + √16 =" works.
        return { ...base, lastExpression: state.pendingOperation ? null : expression };
      }
      return {
        ...base,
        accumulator: request.continueWith ? result : null,
        pendingOperation: request.continueWith,
        lastExpression: request.continueWith ? null : expression,
      };
    }

    case 'evaluationFailed': {
      const expression = formatExpression(action.request.operation, action.request.operands);
      const line: TapeLine = { id: state.nextTapeId, expression, status: 'error', message: action.message };
      // Keep the pending operation so the person can correct the second number and retry.
      return { ...state, status: 'idle', overwrite: true, error: action.message, ...appendLine(state, line) };
    }
  }
}

function appendLine(state: CalculatorState, line: TapeLine): Pick<CalculatorState, 'tape' | 'nextTapeId'> {
  return { tape: [...state.tape, line].slice(-TAPE_LIMIT), nextTapeId: state.nextTapeId + 1 };
}

/** Pressing an operator evaluates the pending calculation first when a second number was typed. */
export function planOperator(state: CalculatorState, operation: BinaryOperation): EvaluationRequest | null {
  if (state.pendingOperation === null || state.accumulator === null || state.overwrite) {
    return null;
  }
  return { operation: state.pendingOperation, operands: [state.accumulator, Number(state.entry)], continueWith: operation };
}

export function planEquals(state: CalculatorState): EvaluationRequest | null {
  if (state.pendingOperation === null || state.accumulator === null) {
    return null;
  }
  return { operation: state.pendingOperation, operands: [state.accumulator, Number(state.entry)], continueWith: null };
}

export function planUnary(state: CalculatorState, operation: UnaryOperation): EvaluationRequest {
  return { operation, operands: [Number(state.entry)], continueWith: null };
}

/** The small line above the main readout: the calculation in progress or the one just finished. */
export function expressionLine(state: CalculatorState): string {
  if (state.pendingOperation !== null && state.accumulator !== null) {
    return `${formatNumber(state.accumulator)} ${OPERATIONS[state.pendingOperation].symbol}`;
  }
  return state.lastExpression ? `${state.lastExpression} =` : '';
}
