import { useEffect, useReducer, useRef } from 'react';
import { ApiError, type CalculatorApi } from '../api/calculatorClient';
import {
  type CalculatorAction,
  type CalculatorState,
  type EvaluationRequest,
  calculatorReducer,
  initialState,
  planEquals,
  planOperator,
  planUnary,
} from '../domain/calculator';
import type { Command } from '../domain/commands';
import { parseEntry } from '../domain/number';

type Step = { kind: 'dispatch'; action: CalculatorAction } | { kind: 'evaluate'; request: EvaluationRequest } | null;

/** Decides whether a command is a local state change or needs the API. */
function stepFor(state: CalculatorState, command: Command): Step {
  switch (command.type) {
    case 'digit':
      return { kind: 'dispatch', action: { type: 'digit', digit: command.digit } };
    case 'decimal':
    case 'backspace':
    case 'toggleSign':
    case 'clear':
      return { kind: 'dispatch', action: { type: command.type } };
    case 'operator': {
      const request = planOperator(state, command.operation);
      return request
        ? { kind: 'evaluate', request }
        : { kind: 'dispatch', action: { type: 'operator', operation: command.operation } };
    }
    case 'unary':
      return { kind: 'evaluate', request: planUnary(state, command.operation) };
    case 'equals': {
      const request = planEquals(state);
      return request ? { kind: 'evaluate', request } : null;
    }
  }
}

/** Wires the pure calculator state machine to the API. */
export function useCalculator(api: CalculatorApi) {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function evaluate(request: EvaluationRequest) {
    const controller = new AbortController();
    inFlight.current = controller;
    dispatch({ type: 'evaluationStarted' });
    try {
      const result = await api.calculate(request.operation, request.operands, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      dispatch({ type: 'evaluationSucceeded', request, result });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof ApiError ? error.message : 'Something went wrong. Try again.';
      dispatch({ type: 'evaluationFailed', request, message });
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
      }
    }
  }

  function run(command: Command) {
    if (command.type === 'clear') {
      inFlight.current?.abort();
      inFlight.current = null;
    }
    const step = stepFor(state, command);
    if (step?.kind === 'dispatch') {
      dispatch(step.action);
    } else if (step?.kind === 'evaluate' && state.status === 'idle') {
      void evaluate(step.request);
    }
  }

  function pasteEntry(text: string) {
    const parsed = parseEntry(text);
    dispatch(parsed.ok ? { type: 'entrySet', entry: parsed.entry } : { type: 'inputRejected', message: parsed.message });
  }

  return { state, run, pasteEntry, clearTape: () => dispatch({ type: 'clearTape' }) };
}
