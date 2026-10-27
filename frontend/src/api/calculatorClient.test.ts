import { describe, expect, it, vi } from 'vitest';
import { ApiError, createCalculatorClient } from './calculatorClient';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function clientWith(fetchImpl: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(fetchImpl);
  return { fetch, client: createCalculatorClient({ baseUrl: 'http://api.test/api/', fetch }) };
}

const clientReturning = (response: Response) => clientWith(() => Promise.resolve(response));
const clientRejecting = (error: unknown) => clientWith(() => Promise.reject(error));

async function expectApiError(promise: Promise<unknown>, code: string, message?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
  if (message) {
    expect((error as ApiError).message).toBe(message);
  }
}

describe('createCalculatorClient', () => {
  it('posts operands to the operation endpoint and returns the result', async () => {
    const { client, fetch } = clientReturning(json(200, { operation: 'divide', operands: [6, 3], result: 2 }));

    await expect(client.calculate('divide', [6, 3])).resolves.toBe(2);

    expect(fetch).toHaveBeenCalledWith(
      'http://api.test/api/v1/divide',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ operands: [6, 3] }) }),
    );
  });

  it('passes the abort signal through', async () => {
    const { client, fetch } = clientReturning(json(200, { result: 4 }));
    const controller = new AbortController();

    await client.calculate('sqrt', [16], controller.signal);

    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('rejects non-finite operands before calling the service', async () => {
    const { client, fetch } = clientReturning(json(200, { result: 0 }));

    await expectApiError(client.calculate('add', [1, NaN]), 'INVALID_INPUT');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses friendly copy for known error codes', async () => {
    const { client } = clientReturning(
      json(422, { error: { code: 'DIVISION_BY_ZERO', message: 'division by zero is undefined' } }),
    );

    await expectApiError(client.calculate('divide', [1, 0]), 'DIVISION_BY_ZERO', "Can't divide by zero.");
  });

  it("falls back to the server's message for unknown codes", async () => {
    const { client } = clientReturning(json(400, { error: { code: 'SOMETHING_NEW', message: 'Server says no.' } }));

    await expectApiError(client.calculate('add', [1, 2]), 'SOMETHING_NEW', 'Server says no.');
  });

  it('reports the HTTP status when the error body is not JSON', async () => {
    const { client } = clientReturning(new Response('Bad gateway', { status: 502 }));

    await expectApiError(
      client.calculate('add', [1, 2]),
      'SERVER_ERROR',
      'The calculator service returned an error (HTTP 502). Try again.',
    );
  });

  it('reports network failures', async () => {
    const { client } = clientRejecting(new TypeError('Failed to fetch'));

    await expectApiError(client.calculate('add', [1, 2]), 'NETWORK_ERROR');
  });

  it('rethrows aborts untouched', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('Aborted', 'AbortError');
    const { client } = clientRejecting(abort);

    await expect(client.calculate('add', [1, 2], controller.signal)).rejects.toBe(abort);
  });

  it.each([{}, { result: '4' }, { result: null }, null])('rejects malformed success body %j', async body => {
    const { client } = clientReturning(json(200, body));

    await expectApiError(client.calculate('add', [2, 2]), 'INVALID_RESPONSE');
  });
});
