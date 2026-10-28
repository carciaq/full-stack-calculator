import { useEffect, useRef } from 'react';
import type { TapeLine } from '../domain/calculator';

interface TapeProps {
  lines: TapeLine[];
  /** Called with a result's text when the person picks it to reuse. */
  onRecall: (result: string) => void;
  onClear: () => void;
}

export function Tape({ lines, onRecall, onClear }: TapeProps) {
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
          <p className="tape__empty">Each calculation prints here. Select a result to use it again.</p>
        ) : (
          <ol className="tape__lines">
            {lines.map(line => (
              <li key={line.id} className={`tape__line tape__line--${line.status}`}>
                {line.status === 'ok' ? (
                  <button
                    type="button"
                    className="tape__entry"
                    title="Use this result"
                    aria-label={`Use result: ${line.expression} = ${line.result}`}
                    onClick={() => onRecall(line.result)}
                  >
                    <span className="tape__expression">{line.expression}</span>
                    <span className="tape__result">= {line.result}</span>
                  </button>
                ) : (
                  <div className="tape__entry">
                    <span className="tape__expression">{line.expression}</span>
                    <span className="tape__result">{line.message}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
