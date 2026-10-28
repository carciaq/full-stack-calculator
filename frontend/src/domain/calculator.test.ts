import { describe, expect, it } from 'vitest';
import {
  type CalculatorAction,
  type CalculatorState,
  type EvaluationRequest,
  TAPE_LIMIT,
  calculatorReducer,
  expressionLine,
  initialState,
  planEquals,
  planOperator,
  planUnary,
} from './calculator';
import { MAX_DIGITS } from './number';

const run = (actions: CalculatorAction[], state: CalculatorState = initialState) =>
  actions.reduce(calculatorReducer, state);

const type = (text: string): CalculatorAction[] =>
  [...text].map(char => (char === '.' ? { type: 'decimal' } : { type: 'digit', digit: char }));

const succeed = (request: EvaluationRequest, result: number): CalculatorAction[] => [
  { type: 'evaluationStarted' },
  { type: 'evaluationSucceeded', request, result },
];

describe('entering numbers', () => {
  it('replaces the leading zero and appends digits', () => {
    expect(run(type('120')).entry).toBe('120');
  });

  it('allows a single decimal point', () => {
    expect(run(type('1.2.5')).entry).toBe('1.25');
    expect(run(type('.5')).entry).toBe('0.5');
  });

  it('stops at the digit limit and explains why', () => {
    const state = run(type('9'.repeat(MAX_DIGITS + 1)));
    expect(state.entry).toBe('9'.repeat(MAX_DIGITS));
    expect(state.error).toBe(`Numbers can have at most ${MAX_DIGITS} digits.`);
  });

  it('backspace removes the last character and falls back to zero', () => {
    expect(run([...type('12'), { type: 'backspace' }]).entry).toBe('1');
    expect(run([...type('7'), { type: 'backspace' }]).entry).toBe('0');
    expect(run([...type('5'), { type: 'toggleSign' }, { type: 'backspace' }]).entry).toBe('0');
  });

  it('toggles the sign, including on zero so negative numbers can be typed', () => {
    expect(run([...type('5'), { type: 'toggleSign' }]).entry).toBe('-5');
    expect(run([...type('5'), { type: 'toggleSign' }, { type: 'toggleSign' }]).entry).toBe('5');
    expect(run([{ type: 'toggleSign' }, ...type('3')]).entry).toBe('-3');
  });

  it('sets a validated pasted entry', () => {
    expect(run([{ type: 'entrySet', entry: '-4.5' }]).entry).toBe('-4.5');
  });

  it('shows a rejection message without changing the entry', () => {
    const state = run([...type('8'), { type: 'inputRejected', message: 'nope' }]);
    expect(state).toMatchObject({ entry: '8', error: 'nope' });
  });
});

describe('operators', () => {
  it('stores the first operand and waits for the second', () => {
    const state = run([...type('12'), { type: 'operator', operation: 'multiply' }]);
    expect(state).toMatchObject({ accumulator: 12, pendingOperation: 'multiply', overwrite: true });
    expect(expressionLine(state)).toBe('12 ×');
  });

  it('starts a fresh entry after an operator', () => {
    const state = run([...type('12'), { type: 'operator', operation: 'add' }, ...type('3')]);
    expect(state.entry).toBe('3');
  });

  it('swaps the operator when pressed twice in a row', () => {
    const state = run([...type('12'), { type: 'operator', operation: 'add' }, { type: 'operator', operation: 'divide' }]);
    expect(state).toMatchObject({ accumulator: 12, pendingOperation: 'divide' });
  });
});

describe('planning API calls', () => {
  const twelvePlusThree = run([...type('12'), { type: 'operator', operation: 'add' }, ...type('3')]);

  it('equals evaluates the pending operation', () => {
    expect(planEquals(twelvePlusThree)).toEqual({ operation: 'add', operands: [12, 3], continueWith: null });
  });

  it('equals does nothing without a pending operation', () => {
    expect(planEquals(run(type('5')))).toBeNull();
  });

  it('a second operator chains the calculation', () => {
    expect(planOperator(twelvePlusThree, 'multiply')).toEqual({
      operation: 'add',
      operands: [12, 3],
      continueWith: 'multiply',
    });
  });

  it('an operator right after another operator does not call the API', () => {
    const state = run([...type('12'), { type: 'operator', operation: 'add' }]);
    expect(planOperator(state, 'subtract')).toBeNull();
  });

  it('unary operations apply to the current entry', () => {
    expect(planUnary(run(type('16')), 'sqrt')).toEqual({ operation: 'sqrt', operands: [16], continueWith: null });
  });
});

describe('evaluation results', () => {
  const request: EvaluationRequest = { operation: 'add', operands: [0.1, 0.2], continueWith: null };

  it('marks the calculator busy and ignores input while waiting', () => {
    const pending = run([{ type: 'evaluationStarted' }]);
    expect(pending.status).toBe('pending');
    expect(run(type('9'), pending)).toBe(pending);
    expect(run([{ type: 'operator', operation: 'add' }], pending)).toBe(pending);
  });

  it('shows the formatted result and prints it on the tape', () => {
    const state = run(succeed(request, 0.30000000000000004));
    expect(state).toMatchObject({ entry: '0.3', status: 'idle', accumulator: null, pendingOperation: null });
    expect(state.tape).toEqual([{ id: 1, expression: '0.1 + 0.2', status: 'ok', result: '0.3' }]);
    expect(expressionLine(state)).toBe('0.1 + 0.2 =');
  });

  it('typing after a result starts a new number', () => {
    const state = run([...succeed(request, 0.3), ...type('7')]);
    expect(state.entry).toBe('7');
    expect(expressionLine(state)).toBe('');
  });

  it('chained results become the next first operand', () => {
    const state = run(succeed({ operation: 'add', operands: [2, 3], continueWith: 'multiply' }, 5));
    expect(state).toMatchObject({ entry: '5', accumulator: 5, pendingOperation: 'multiply', overwrite: true });
  });

  it('a unary result keeps the calculation in progress', () => {
    const inProgress = run([...type('9'), { type: 'operator', operation: 'add' }, ...type('16')]);
    const state = run(succeed(planUnary(inProgress, 'sqrt'), 4), inProgress);
    expect(state).toMatchObject({ entry: '4', accumulator: 9, pendingOperation: 'add' });
    expect(planEquals(state)).toEqual({ operation: 'add', operands: [9, 4], continueWith: null });
  });

  it('an operator after a unary result chains instead of replacing the pending operator', () => {
    const inProgress = run([...type('9'), { type: 'operator', operation: 'add' }, ...type('16')]);
    const state = run(succeed(planUnary(inProgress, 'sqrt'), 4), inProgress);
    expect(planOperator(state, 'multiply')).toEqual({ operation: 'add', operands: [9, 4], continueWith: 'multiply' });
  });

  it('an operator after a chained result replaces the carried operator', () => {
    const state = run(succeed({ operation: 'add', operands: [2, 3], continueWith: 'multiply' }, 5));
    expect(planOperator(state, 'divide')).toBeNull();
    expect(run([{ type: 'operator', operation: 'divide' }], state)).toMatchObject({ accumulator: 5, pendingOperation: 'divide' });
  });

  it('a failure keeps the operation so the second number can be corrected', () => {
    const divide: EvaluationRequest = { operation: 'divide', operands: [8, 0], continueWith: null };
    const failed = run(
      [{ type: 'evaluationStarted' }, { type: 'evaluationFailed', request: divide, message: "Can't divide by zero." }],
      run([...type('8'), { type: 'operator', operation: 'divide' }, ...type('0')]),
    );
    expect(failed).toMatchObject({ status: 'idle', error: "Can't divide by zero.", pendingOperation: 'divide' });
    expect(failed.tape).toEqual([{ id: 1, expression: '8 ÷ 0', status: 'error', message: "Can't divide by zero." }]);

    const corrected = run(type('2'), failed);
    expect(corrected.error).toBeNull();
    expect(planEquals(corrected)).toEqual({ operation: 'divide', operands: [8, 2], continueWith: null });
  });

  it('keeps only the most recent tape lines', () => {
    const many = Array.from({ length: TAPE_LIMIT + 5 }, () => succeed(request, 0.3)).flat();
    const state = run(many);
    expect(state.tape).toHaveLength(TAPE_LIMIT);
    expect(state.tape[0]?.id).toBe(6);
  });
});

describe('recalling a tape result', () => {
  it('shows the value and lets typing replace it', () => {
    const recalled = run([...type('7'), { type: 'recall', entry: '15' }]);
    expect(recalled).toMatchObject({ entry: '15', error: null });
    expect(run(type('2'), recalled).entry).toBe('2');
  });

  it('becomes the second operand of a pending operation', () => {
    const state = run([...type('12'), { type: 'operator', operation: 'add' }, { type: 'recall', entry: '1.5e+20' }]);
    expect(planEquals(state)).toEqual({ operation: 'add', operands: [12, 1.5e20], continueWith: null });
    expect(planOperator(state, 'multiply')).toEqual({ operation: 'add', operands: [12, 1.5e20], continueWith: 'multiply' });
  });

  it('becomes the first operand when nothing is pending', () => {
    const state = run([{ type: 'recall', entry: '-0.5' }, { type: 'operator', operation: 'multiply' }]);
    expect(state).toMatchObject({ accumulator: -0.5, pendingOperation: 'multiply' });
  });

  it('is ignored while a calculation is running', () => {
    const pending = run([{ type: 'evaluationStarted' }]);
    expect(run([{ type: 'recall', entry: '3' }], pending)).toBe(pending);
  });
});

describe('clearing', () => {
  it('clear resets the calculation but keeps the tape', () => {
    const state = run([
      ...succeed({ operation: 'add', operands: [1, 1], continueWith: null }, 2),
      ...type('5'),
      { type: 'operator', operation: 'add' },
      { type: 'clear' },
    ]);
    expect(state).toMatchObject({ entry: '0', accumulator: null, pendingOperation: null, error: null });
    expect(state.tape).toHaveLength(1);
  });

  it('clear also cancels a pending evaluation', () => {
    expect(run([{ type: 'evaluationStarted' }, { type: 'clear' }]).status).toBe('idle');
  });

  it('clear tape empties the tape only', () => {
    const state = run([...succeed({ operation: 'add', operands: [1, 1], continueWith: null }, 2), { type: 'clearTape' }]);
    expect(state.tape).toEqual([]);
    expect(state.entry).toBe('2');
  });
});
