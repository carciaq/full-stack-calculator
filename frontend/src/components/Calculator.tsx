import { useEffect, useEffectEvent } from 'react';
import type { CalculatorApi } from '../api/calculatorClient';
import { expressionLine } from '../domain/calculator';
import { commandForKey } from '../domain/commands';
import { useCalculator } from '../hooks/useCalculator';
import { Display } from './Display';
import { Keypad } from './Keypad';
import { Tape } from './Tape';

interface CalculatorProps {
  api: CalculatorApi;
}

export function Calculator({ api }: CalculatorProps) {
  const { state, run, pasteEntry, recall, clearTape } = useCalculator(api);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    // Let a focused button handle Enter and Space itself, otherwise the key fires twice.
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLButtonElement) {
      return;
    }
    const command = commandForKey(event.key);
    if (command) {
      event.preventDefault();
      run(command);
    }
  });

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text');
    if (text) {
      event.preventDefault();
      pasteEntry(text);
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  return (
    <main className="workspace">
      <div className="machine">
        <h1 className="machine__name">Calculator</h1>
        <Display
          expression={expressionLine(state)}
          entry={state.entry}
          error={state.error}
          pending={state.status === 'pending'}
        />
        <Keypad onCommand={run} />
      </div>
      <Tape lines={state.tape} onRecall={recall} onClear={clearTape} />
    </main>
  );
}
