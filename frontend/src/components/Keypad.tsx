import type { Command } from '../domain/commands';
import { OPERATIONS } from '../domain/operations';

type Variant = 'digit' | 'operator' | 'function' | 'equals' | 'clear';

interface KeyDef {
  label: string;
  /** Accessible name when the visible label is a symbol. */
  name?: string;
  command: Command;
  variant: Variant;
  shortcut: string;
  wide?: boolean;
  tall?: boolean;
}

const digit = (d: string): KeyDef => ({ label: d, command: { type: 'digit', digit: d }, variant: 'digit', shortcut: d });

const op = (operation: keyof typeof OPERATIONS, shortcut: string, variant: Variant = 'operator', label?: string): KeyDef => ({
  label: label ?? OPERATIONS[operation].symbol,
  name: OPERATIONS[operation].label,
  command: operation === 'sqrt' ? { type: 'unary', operation } : { type: 'operator', operation },
  variant,
  shortcut,
});

// Laid out row by row on a 4-column grid; "=" spans two rows and "0" two columns.
const KEYS: KeyDef[] = [
  { label: 'AC', name: 'All clear', command: { type: 'clear' }, variant: 'clear', shortcut: 'Escape' },
  { label: '⌫', name: 'Backspace', command: { type: 'backspace' }, variant: 'function', shortcut: 'Backspace' },
  { label: '±', name: 'Change sign', command: { type: 'toggleSign' }, variant: 'function', shortcut: 'N' },
  op('divide', '/'),
  op('sqrt', 'R', 'function'),
  op('power', '^', 'function', 'xʸ'),
  op('percentage', '%', 'function', '%'),
  op('multiply', '*'),
  digit('7'),
  digit('8'),
  digit('9'),
  op('subtract', '-'),
  digit('4'),
  digit('5'),
  digit('6'),
  op('add', '+'),
  digit('1'),
  digit('2'),
  digit('3'),
  { label: '=', name: 'Equals', command: { type: 'equals' }, variant: 'equals', shortcut: 'Enter', tall: true },
  { ...digit('0'), wide: true },
  { label: '.', name: 'Decimal point', command: { type: 'decimal' }, variant: 'digit', shortcut: '.' },
];

interface KeypadProps {
  onCommand: (command: Command) => void;
}

export function Keypad({ onCommand }: KeypadProps) {
  return (
    <div className="keypad" role="group" aria-label="Keypad">
      {KEYS.map(key => (
        <button
          key={key.label}
          type="button"
          className={`key key--${key.variant}${key.wide ? ' key--wide' : ''}${key.tall ? ' key--tall' : ''}`}
          aria-label={key.name}
          aria-keyshortcuts={key.shortcut}
          onClick={() => onCommand(key.command)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
