# Calculator frontend

React 19 + TypeScript + Vite client for the calculator service.

## Run

```bash
pnpm install
pnpm dev          # http://localhost:5173, proxies /api to http://localhost:8080
```

Point the dev proxy at another backend with `API_PROXY_TARGET=http://host:port pnpm dev`, or bypass the proxy
entirely by setting `VITE_API_BASE_URL` at build time (see `.env.example`).

| Script          | What it does                                  |
| --------------- | --------------------------------------------- |
| `pnpm test`     | Run unit and component tests once (Vitest)    |
| `pnpm coverage` | Tests plus coverage report in `coverage/`     |
| `pnpm lint`     | ESLint                                        |
| `pnpm build`    | Type-check and build static files to `dist/`  |

## API contract

```
POST /api/v1/{operation}            operation: add | subtract | multiply | divide | power | percentage | sqrt
     { "operands": [12, 3] }        sqrt takes one operand, the rest take two

200  { "operation": "add", "operands": [12, 3], "result": 15 }
4xx  { "error": { "code": "DIVISION_BY_ZERO", "message": "division by zero is undefined" } }
```

`percentage` is "a percent of b": `[15, 200]` → `30`. Known error codes (`DIVISION_BY_ZERO`,
`NEGATIVE_SQUARE_ROOT`, `RESULT_OUT_OF_RANGE`) get friendly copy in the UI; any other code shows the server's message.

## Structure

```
src/
  domain/      pure TypeScript, no React
    calculator.ts   state machine (reducer) + plan* functions that decide when the API is called
    commands.ts     the actions a person can take, and the keyboard map
    number.ts       formatting (12 significant digits) and validation of typed/pasted numbers
    operations.ts   operation catalog: symbols, labels, arity
  api/         HTTP client; turns every failure into a typed ApiError
  hooks/       useCalculator: connects the reducer to the API, handles cancellation
  components/  Calculator (layout, keyboard and paste), Display, Keypad, Tape
```

### Design decisions

- **The backend does the math.** The frontend validates input shape only: digit limit, a single decimal
  point, plain numbers when pasting. Rules like division by zero belong to the service, so they live in one place.
- **Pure reducer, thin hook.** All calculator behavior (chaining `2 + 3 ×`, swapping operators, correcting a
  divisor after an error) is in a reducer tested without React or network. The hook only does I/O.
- **The API is injected.** `Calculator` takes a `CalculatorApi`, so component tests use an in-memory fake
  and never mock `fetch`.
- **Stale responses are dropped.** Each request carries an `AbortController`. All clear cancels it, and a
  late response is ignored.
- **Display rounding.** Results are rounded to 12 significant digits, so `0.1 + 0.2` shows `0.3`.
- **Paper tape.** Every calculation, including failed ones (printed in red), goes on a tape next to the
  keypad, as on an adding machine.

### Keyboard

Digits, `.` or `,`, `+ - * / ^ %`, `r` for square root, `n` to change the sign, `Enter` or `=` to evaluate,
`Backspace` to delete, `Esc` to clear all. Pasting a number puts it into the display.
