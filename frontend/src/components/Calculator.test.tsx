import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type CalculatorApi } from '../api/calculatorClient';
import type { Operation } from '../domain/operations';
import { Calculator } from './Calculator';

/** An in-memory stand-in for the Go service. */
function fakeApi(): CalculatorApi & { calculate: ReturnType<typeof vi.fn> } {
  const compute: Record<Operation, (a: number, b: number) => number> = {
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
    multiply: (a, b) => a * b,
    divide: (a, b) => a / b,
    power: (a, b) => a ** b,
    percentage: (a, b) => (a / 100) * b,
    sqrt: a => Math.sqrt(a),
  };
  return {
    calculate: vi.fn(async (operation: Operation, [a = 0, b = 0]: readonly number[]) => {
      if (operation === 'divide' && b === 0) {
        throw new ApiError('DIVISION_BY_ZERO', "Can't divide by zero.", 422);
      }
      return compute[operation](a, b);
    }),
  };
}

function setup(api: CalculatorApi = fakeApi()) {
  const user = userEvent.setup();
  render(<Calculator api={api} />);
  const press = async (...names: string[]) => {
    for (const name of names) {
      await user.click(screen.getByRole('button', { name }));
    }
  };
  return { user, press, api };
}

describe('Calculator', () => {
  it('adds two numbers through the API and prints the tape', async () => {
    const { press, api } = setup();

    await press('1', '2', 'Add', '3', 'Equals');

    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('15'));
    expect(api.calculate).toHaveBeenCalledWith('add', [12, 3], expect.any(AbortSignal));
    expect(screen.getByTestId('expression')).toHaveTextContent('12 + 3 =');
    const tape = within(screen.getByRole('list'));
    expect(tape.getByText('12 + 3')).toBeInTheDocument();
    expect(tape.getByText('= 15')).toBeInTheDocument();
  });

  it('chains operations left to right', async () => {
    const { press } = setup();

    await press('2', 'Add', '3', 'Multiply');
    await waitFor(() => expect(screen.getByTestId('expression')).toHaveTextContent('5 ×'));
    await press('4', 'Equals');

    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('20'));
  });

  it('runs advanced operations', async () => {
    const { press } = setup();

    await press('8', '1', 'Square root');
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('9'));

    await press('Power', '2', 'Equals');
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('81'));

    await press('All clear', '1', '5', 'Percent of', '2', '0', '0', 'Equals');
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('30'));
  });

  it('shows the API error and lets the person correct the divisor', async () => {
    const { press } = setup();

    await press('8', 'Divide', '0', 'Equals');

    expect(await screen.findByTestId('message')).toHaveTextContent("Can't divide by zero.");
    expect(within(screen.getByRole('list')).getByText("Can't divide by zero.")).toBeInTheDocument();

    await press('2', 'Equals');
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('4'));
    expect(screen.getByTestId('message')).toBeEmptyDOMElement();
  });

  it('shows network errors from the client', async () => {
    const api: CalculatorApi = {
      calculate: vi.fn().mockRejectedValue(new ApiError('NETWORK_ERROR', "Can't reach the calculator service.")),
    };
    const { press } = setup(api);

    await press('1', 'Add', '1', 'Equals');

    expect(await screen.findByTestId('message')).toHaveTextContent("Can't reach the calculator service.");
  });

  it('shows a generic message for unexpected errors', async () => {
    const api: CalculatorApi = { calculate: vi.fn().mockRejectedValue(new Error('boom')) };
    const { press } = setup(api);

    await press('1', 'Add', '1', 'Equals');

    expect(await screen.findByTestId('message')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('shows progress while waiting and ignores the stale result after clearing', async () => {
    let resolve: (value: number) => void = () => {};
    const api: CalculatorApi = { calculate: vi.fn(() => new Promise<number>(r => (resolve = r))) };
    const { press } = setup(api);

    await press('6', 'Multiply', '7', 'Equals');
    expect(screen.getByTestId('message')).toHaveTextContent('Calculating…');

    await press('All clear');
    resolve(42);

    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('0'));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('supports the keyboard', async () => {
    const { user } = setup();

    await user.keyboard('9-4{Enter}');

    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('5'));
    await user.keyboard('{Backspace}{Escape}');
    expect(screen.getByLabelText('Result')).toHaveTextContent('0');
  });

  it('accepts a pasted number and rejects pasted text', async () => {
    const { user } = setup();

    await user.paste('-12.5');
    expect(screen.getByLabelText('Result')).toHaveTextContent('-12.5');

    await user.paste('twelve');
    expect(screen.getByTestId('message')).toHaveTextContent('Paste a plain number, like 42 or -3.75.');
    expect(screen.getByLabelText('Result')).toHaveTextContent('-12.5');
  });

  it('clears the tape', async () => {
    const { press } = setup();
    expect(screen.getByRole('button', { name: 'Clear tape' })).toBeDisabled();

    await press('1', 'Add', '1', 'Equals');
    await screen.findByRole('list');
    await press('Clear tape');

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText(/Each calculation prints here/)).toBeInTheDocument();
  });

  it('reuses a result from the tape as the next operand', async () => {
    const { press, user, api } = setup();

    await press('1', '2', 'Add', '3', 'Equals');
    await screen.findByRole('list');
    await press('All clear', '2', 'Multiply');
    await user.click(screen.getByRole('button', { name: 'Use result: 12 + 3 = 15' }));

    expect(screen.getByLabelText('Result')).toHaveTextContent('15');
    await press('Equals');
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('30'));
    expect(api.calculate).toHaveBeenLastCalledWith('multiply', [2, 15], expect.any(AbortSignal));
  });

  it('does not offer failed lines for reuse', async () => {
    const { press } = setup();

    await press('8', 'Divide', '0', 'Equals');
    await screen.findByRole('list');

    expect(screen.queryByRole('button', { name: /Use result/ })).not.toBeInTheDocument();
  });
});
