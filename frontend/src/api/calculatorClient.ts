import type { Operation } from '../domain/operations';

/**
 * Contract with the calculator service:
 *
 *   POST {baseUrl}/v1/{operation}        body: { "operands": [number, ...] }
 *   200  { "operation": "divide", "operands": [6, 3], "result": 2 }
 *   4xx  { "error": { "code": "DIVISION_BY_ZERO", "message": "..." } }
 */
export interface CalculatorApi {
  calculate(operation: Operation, operands: readonly number[], signal?: AbortSignal): Promise<number>;
}

export type ApiErrorCode =
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQUARE_ROOT'
  | 'RESULT_OUT_OF_RANGE'
  | 'INVALID_INPUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'SERVER_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number | undefined;

  constructor(code: ApiErrorCode | string, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Copy shown to people for errors we recognize; anything else falls back to the server's message. */
const MESSAGES: Partial<Record<string, string>> = {
  DIVISION_BY_ZERO: "Can't divide by zero.",
  NEGATIVE_SQUARE_ROOT: "Can't take the square root of a negative number.",
  RESULT_OUT_OF_RANGE: 'The result is too large to calculate.',
  NETWORK_ERROR: "Can't reach the calculator service. Check that it's running, then try again.",
  INVALID_RESPONSE: 'The calculator service sent an unexpected response.',
};

interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createCalculatorClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api',
  fetch: fetchFn = (...args) => fetch(...args),
}: ClientOptions = {}): CalculatorApi {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async calculate(operation, operands, signal) {
      if (!operands.every(Number.isFinite)) {
        throw new ApiError('INVALID_INPUT', 'Enter a valid number.');
      }

      let response: Response;
      try {
        response = await fetchFn(`${root}/v1/${operation}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ operands }),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        throw new ApiError('NETWORK_ERROR', MESSAGES.NETWORK_ERROR!);
      }

      const body = await readJson(response);

      if (!response.ok) {
        const { code, message } = parseErrorBody(body, response.status);
        throw new ApiError(code, MESSAGES[code] ?? message, response.status);
      }

      if (!isRecord(body) || typeof body.result !== 'number' || !Number.isFinite(body.result)) {
        throw new ApiError('INVALID_RESPONSE', MESSAGES.INVALID_RESPONSE!, response.status);
      }
      return body.result;
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorBody(body: unknown, status: number): { code: string; message: string } {
  const error = isRecord(body) ? body.error : undefined;
  if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code, message: error.message };
  }
  return { code: 'SERVER_ERROR', message: `The calculator service returned an error (HTTP ${status}). Try again.` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
