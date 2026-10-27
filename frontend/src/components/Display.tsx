interface DisplayProps {
  expression: string;
  entry: string;
  error: string | null;
  pending: boolean;
}

export function Display({ expression, entry, error, pending }: DisplayProps) {
  const size = entry.length > 13 ? 'small' : entry.length > 9 ? 'medium' : 'large';

  return (
    <div className="display" aria-busy={pending}>
      <p className="display__expression" data-testid="expression">
        {expression}
      </p>
      <output className={`display__entry display__entry--${size}`} aria-label="Result" aria-live="polite">
        {entry}
      </output>
      <p className="display__message" aria-live="polite" data-testid="message">
        {error ?? (pending ? 'Calculating…' : '')}
      </p>
    </div>
  );
}
