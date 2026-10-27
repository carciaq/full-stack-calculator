/** Longest number, in digits, a person can type or paste. */
export const MAX_DIGITS = 15;

const SIGNIFICANT_DIGITS = 12;
const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

/**
 * Formats a result for display. Rounds to 12 significant digits so floating point
 * noise (0.1 + 0.2 = 0.30000000000000004) never reaches the screen, and switches to
 * scientific notation for very large or very small magnitudes.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`cannot format non-finite number: ${value}`);
  }
  const abs = Math.abs(value);
  if (abs === 0) {
    return '0';
  }
  if (abs >= 1e15 || abs < 1e-6) {
    return value.toExponential(SIGNIFICANT_DIGITS - 1).replace(/\.?0+e/, 'e');
  }
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
}

export function countDigits(entry: string): number {
  return entry.replace(/\D/g, '').length;
}

export type ParseResult = { ok: true; entry: string } | { ok: false; message: string };

/**
 * Validates free-form text (for example pasted from the clipboard) and normalizes it
 * into an entry the keypad could have produced.
 */
export function parseEntry(text: string): ParseResult {
  const candidate = text.trim().replace(/[\s_]/g, '').replace(/^\+/, '').replace(/^−/, '-');
  if (!PLAIN_NUMBER.test(candidate)) {
    return { ok: false, message: 'Paste a plain number, like 42 or -3.75.' };
  }
  if (countDigits(candidate) > MAX_DIGITS) {
    return { ok: false, message: `Numbers can have at most ${MAX_DIGITS} digits.` };
  }
  const normalized = candidate.startsWith('-.') ? `-0${candidate.slice(1)}` : candidate.startsWith('.') ? `0${candidate}` : candidate;
  return { ok: true, entry: normalized.replace(/^(-?)0+(?=\d)/, '$1') };
}

