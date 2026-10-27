import { useEffect, useRef } from 'react';
import type { TapeLine } from '../domain/calculator';

interface TapeProps {
  lines: TapeLine[];
  onClear: () => void;
}

export function Tape({ lines, onClear }: TapeProps) {
  const paper = useRef<HTMLDivElement>(null);

  // New lines print at the bottom, like an adding machine; keep the latest in view.
  useEffect(() => {
    if (paper.current) {
      paper.current.scrollTop = paper.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <section className="tape" aria-labelledby="tape-title">
      <div className="tape__header">
        <h2 id="tape-title" className="tape__title">
          Tape
        </h2>
        <button type="button" className="tape__clear" onClick={onClear} disabled={lines.length === 0}>
          Clear tape
        </button>
      </div>
      <div className="tape__paper" ref={paper} tabIndex={0} aria-label="Calculation history">
        {lines.length === 0 ? (
          <p className="tape__empty">Each calculation prints here, so you can check your work.</p>
        ) : (
          <ol className="tape__lines">
            {lines.map(line => (
              <li key={line.id} className={`tape__line tape__line--${line.status}`}>
                <span className="tape__expression">{line.expression}</span>
                {line.status === 'ok' ? (
                  <span className="tape__result">= {line.result}</span>
                ) : (
                  <span className="tape__result">{line.message}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
