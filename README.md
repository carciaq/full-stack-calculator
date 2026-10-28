# Full-Stack Calculator

A calculator with a **Go REST API** that does the arithmetic and a **React + TypeScript** frontend that
works like a desk calculator with a paper tape.

```
┌──────────────────────────┐   POST /api/v1/{operation}   ┌──────────────────────────┐
│  frontend/  (React 19)   │ ───────────────────────────▶ │  backend/  (Go 1.24)     │
│  keypad · display · tape │ ◀─────────────────────────── │  net/http, no deps       │
│  state machine (reducer) │   { "result": 15 }           │  calculator package      │
└──────────────────────────┘                              └──────────────────────────┘
       :5173 (Vite dev server proxies /api ──▶ :8080)
```

- **Operations:** add, subtract, multiply, divide, power, percentage (`a % of b`), square root
- **Chained calculations:** `2 + 3 × 4 =` evaluates left to right like a pocket calculator (`20`)
- **Paper tape:** every calculation, failures included, is printed on a tape; click a result to reuse it
- **Keyboard and paste support**, with friendly error messages for invalid input and math errors

## Contents

- [Repository layout](#repository-layout)
- [Setup](#setup)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Examples](#examples)
- [Using the calculator](#using-the-calculator)
- [Testing](#testing)
- [Design rationale and decisions](#design-rationale-and-decisions)

## Repository layout

```
backend/
  cmd/server/            entry point: config from env, HTTP server, graceful shutdown
  internal/calculator/   the arithmetic; knows nothing about HTTP
  internal/httpapi/      routes, JSON decoding, error mapping, middleware (logging, recovery, CORS)
frontend/
  src/domain/            pure TypeScript: calculator state machine, commands, number formatting
  src/api/               HTTP client that turns every failure into a typed ApiError
  src/hooks/             useCalculator: connects the state machine to the API
  src/components/        Calculator, Display, Keypad, Tape
```

The frontend has its own [README](frontend/README.md) with more detail on its internals.

## Setup

### Prerequisites

| Tool    | Version | Used for            |
| ------- | ------- | ------------------- |
| Go      | 1.24+   | backend             |
| Node.js | 22+     | frontend            |
| pnpm    | 10+     | frontend packages   |

### 1. Start the backend

```bash
cd backend
go run ./cmd/server          # listens on http://localhost:8080
```

Check that it is up:

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

To build a binary instead:

```bash
go build -o bin/server ./cmd/server
./bin/server
```

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
pnpm install
pnpm dev                     # http://localhost:5173
```

Open <http://localhost:5173>. The Vite dev server proxies every `/api/*` request to
`http://localhost:8080`, so the browser only ever talks to one origin and no CORS setup is needed.

### Production build

```bash
cd frontend && pnpm build    # type-checks, then writes static files to frontend/dist/
cd backend  && go build -o bin/server ./cmd/server
```

Serve `frontend/dist/` with any static file server and route `/api/` to the Go server (for example
with an nginx `location /api/ { proxy_pass http://backend:8080; }`). If the frontend and API must
live on different origins, build the frontend with `VITE_API_BASE_URL` pointing at the API and
allow the frontend's origin on the backend with `ALLOWED_ORIGINS` (see below).

## Configuration

### Backend (environment variables)

| Variable          | Default | Description                                                                                         |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `PORT`            | `8080`  | Port to listen on (1–65535). The server refuses to start on an invalid value.                       |
| `ALLOWED_ORIGINS` | *none*  | Comma-separated browser origins allowed to call the API cross-origin, or `*` for any origin.         |

```bash
PORT=9000 ALLOWED_ORIGINS=http://localhost:5173,https://calc.example go run ./cmd/server
```

The server logs one JSON line per request to stdout, and on `SIGINT`/`SIGTERM` stops accepting new
connections and gives in-flight requests up to 10 seconds to finish.

### Frontend

| Variable            | When       | Default                 | Description                                                    |
| ------------------- | ---------- | ----------------------- | -------------------------------------------------------------- |
| `API_PROXY_TARGET`  | `pnpm dev` | `http://localhost:8080` | Where the dev server proxies `/api` requests.                  |
| `VITE_API_BASE_URL` | build time | `/api`                  | Base URL of the API, baked into the bundle. See `.env.example`. |

## API reference

Base path: `/api/v1`. All request and response bodies are JSON.

| Method | Path                     | Description                                     |
| ------ | ------------------------ | ----------------------------------------------- |
| `POST` | `/api/v1/{operation}`    | Run an operation on a list of operands          |
| `GET`  | `/api/v1/operations`     | List supported operations and their arity       |
| `GET`  | `/healthz`               | Liveness check, returns `{"status":"ok"}`       |

### `POST /api/v1/{operation}`

**Request**

```json
{ "operands": [12, 3] }
```

`operands` is required and must be an array of finite numbers. Unknown fields, `null` values, extra
JSON after the object, and bodies larger than 1 KiB are rejected.

**Operations**

| `operation`  | Operands | Result                                           |
| ------------ | -------- | ------------------------------------------------ |
| `add`        | `[a, b]` | `a + b`                                          |
| `subtract`   | `[a, b]` | `a − b`                                          |
| `multiply`   | `[a, b]` | `a × b`                                          |
| `divide`     | `[a, b]` | `a ÷ b`                                          |
| `power`      | `[a, b]` | `a` raised to `b`                                |
| `percentage` | `[a, b]` | `a` percent of `b`, that is `a × b / 100`        |
| `sqrt`       | `[a]`    | square root of `a`                               |

**Success: `200 OK`**

```json
{ "operation": "add", "operands": [12, 3], "result": 15 }
```

The response echoes the operation and operands so a client can match it to its request. `result`
is always a finite number.

**Errors**

Every error has the same shape: a stable, machine-readable `code` and a human-readable `message`.

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "Division by zero is undefined." } }
```

| Status | `code`                 | When                                                                        |
| ------ | ---------------------- | --------------------------------------------------------------------------- |
| 400    | `INVALID_INPUT`        | Malformed JSON, missing `operands`, `null` operand, wrong number of operands |
| 404    | `UNKNOWN_OPERATION`    | The path names an operation that doesn't exist; the message lists valid ones |
| 413    | `REQUEST_TOO_LARGE`    | Body larger than 1 KiB                                                      |
| 422    | `DIVISION_BY_ZERO`     | `divide` by 0, or `power` with base 0 and a negative exponent               |
| 422    | `NEGATIVE_SQUARE_ROOT` | `sqrt` of a negative number                                                 |
| 422    | `RESULT_OUT_OF_RANGE`  | The result overflows a 64-bit float, e.g. `power [10, 400]`                 |
| 422    | `UNDEFINED_RESULT`     | The result is not a real number, e.g. `power [-8, 0.5]`                     |
| 500    | `INTERNAL_ERROR`       | An unexpected server error                                                  |

A request with the wrong HTTP method (for example `GET /api/v1/add`) gets the standard
`405 Method Not Allowed` from Go's router.

### `GET /api/v1/operations`

```json
{
  "operations": [
    { "name": "add", "operands": 2 },
    { "name": "divide", "operands": 2 },
    { "name": "multiply", "operands": 2 },
    { "name": "percentage", "operands": 2 },
    { "name": "power", "operands": 2 },
    { "name": "sqrt", "operands": 1 },
    { "name": "subtract", "operands": 2 }
  ]
}
```

Operations are listed alphabetically.

## Examples

These were run against a local server started with `go run ./cmd/server`.

```bash
$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"operands": [12, 3]}'
{"operation":"add","operands":[12,3],"result":15}

$ curl -s -X POST localhost:8080/api/v1/percentage -d '{"operands": [15, 200]}'
{"operation":"percentage","operands":[15,200],"result":30}

$ curl -s -X POST localhost:8080/api/v1/sqrt -d '{"operands": [-4]}'
{"error":{"code":"NEGATIVE_SQUARE_ROOT","message":"The square root of a negative number is not a real number."}}

$ curl -s -X POST localhost:8080/api/v1/divide -d '{"operands": [8, 0]}'
{"error":{"code":"DIVISION_BY_ZERO","message":"Division by zero is undefined."}}

$ curl -s -X POST localhost:8080/api/v1/sqrt -d '{"operands": [1, 2]}'
{"error":{"code":"INVALID_INPUT","message":"Wrong number of operands: sqrt takes 1, got 2."}}

$ curl -s -X POST localhost:8080/api/v1/modulo -d '{"operands": [1, 2]}'
{"error":{"code":"UNKNOWN_OPERATION","message":"Unknown operation \"modulo\". Supported operations: add, divide, multiply, percentage, power, sqrt, subtract."}}
```

### From JavaScript

```ts
const response = await fetch('/api/v1/divide', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ operands: [6, 3] }),
});
const body = await response.json();
if (response.ok) {
  console.log(body.result); // 2
} else {
  console.error(body.error.code, body.error.message);
}
```

Inside the frontend, use the typed client instead. It maps every failure, including network errors
and malformed responses, to an `ApiError` with a `code`:

```ts
import { ApiError, createCalculatorClient } from './api/calculatorClient';

const api = createCalculatorClient(); // baseUrl defaults to VITE_API_BASE_URL or /api
try {
  const result = await api.calculate('power', [2, 10]); // 1024
} catch (error) {
  if (error instanceof ApiError) console.log(error.code, error.message);
}
```

## Using the calculator

| Action               | Keypad   | Keyboard                    |
| -------------------- | -------- | --------------------------- |
| Digits               | `0`–`9`  | `0`–`9`                     |
| Decimal point        | `.`      | `.` or `,`                  |
| Add / subtract       | `+` `−`  | `+` `-`                     |
| Multiply / divide    | `×` `÷`  | `*` or `x`, `/`             |
| Power                | `xʸ`     | `^`                         |
| Percent of           | `%`      | `%`                         |
| Square root          | `√`      | `r`                         |
| Change sign          | `±`      | `n`                         |
| Evaluate             | `=`      | `Enter` or `=`              |
| Delete last digit    | `⌫`      | `Backspace`                 |
| Clear all            | `AC`     | `Esc` or `Delete`           |

- **Chaining:** pressing an operator after a second number evaluates what's pending first, so
  `2 + 3 ×` shows `5` and waits for the next number.
- **Changing your mind:** pressing two operators in a row keeps only the last one.
- **Square root mid-calculation:** `9 + 16 √ =` gives `13`; the root applies to the current number.
- **Percent:** `15 % 200 =` gives `30` (15 percent of 200).
- **Fixing an error:** after `8 ÷ 0 =` fails, type a new divisor and press `=` again.
- **Tape:** click a result on the tape to load it into the display as an operand.
- **Paste:** paste a plain number (`42`, `-3.75`, `1 000 000`) to put it into the display.
- Numbers can have up to 15 digits; results are shown rounded to 12 significant digits.

## Testing

```bash
# backend
cd backend
go test ./...
go test -race -coverprofile=coverage.out ./... && go tool cover -html=coverage.out -o coverage.html

# frontend
cd frontend
pnpm test         # Vitest: unit and component tests
pnpm coverage     # tests plus coverage report in coverage/
pnpm lint         # ESLint
pnpm typecheck    # tsc
```

Backend tests cover the arithmetic and its edge cases, the HTTP contract (status codes, error codes,
input validation), middleware, configuration parsing and graceful shutdown. Frontend tests cover the
state machine, number parsing and formatting, the API client, and the full component with a fake API.

## Design rationale and decisions

### Architecture

**The backend is the single source of truth for the math.** The frontend never computes a result.
It only checks the *shape* of input (digit limit, one decimal point, plain numbers when pasting), and
every rule about what a valid calculation is (division by zero, negative roots, overflow) lives in
one Go package. That keeps the two halves from disagreeing and makes the API usable on its own.

**Layers with one job each.** On the backend, `internal/calculator` is pure arithmetic that returns
sentinel errors; `internal/httpapi` translates HTTP into calls to it and its errors back into HTTP;
`cmd/server` wires up configuration and the server's lifecycle. On the frontend, `domain/` is pure
TypeScript with no React or network, `api/` does HTTP, `hooks/` does I/O orchestration and
`components/` render. Each layer is tested without the layers around it.

### API design

**One endpoint per operation: `POST /api/v1/{operation}`.** The operation is a resource in the path
rather than a field in the body. Unknown operations then get a clean `404`, logs and metrics group
naturally by path, and adding an operation is one entry in a table. `POST` is used even though the
operations are pure because the input is a JSON body, not a query string.

**Operands are an array, not `a`/`b` fields.** `sqrt` takes one operand and the rest take two; an
array handles both with the same request shape, and the server checks arity per operation
(`GET /api/v1/operations` advertises it).

**Versioned path (`/v1`).** A breaking change can ship as `/v2` without breaking deployed clients.

**Stable error codes plus human messages.** Clients branch on `code`, which never changes; `message`
is readable but may be reworded. The frontend shows its own copy for codes it recognizes and falls
back to the server's message for anything new, so the backend can add error types without a
frontend release.

**`400` vs `422`.** `400 INVALID_INPUT` means the request is malformed (not JSON, missing field,
wrong operand count). `422` means the request is well formed but the math has no real, finite answer.
The split lets clients tell "my code is wrong" apart from "the user asked for something impossible".

**Strict input decoding.** Go's JSON decoder silently turns `null` into `0` for a `float64`, which
would make `{"operands": [5, null]}` divide by zero or worse. Operands are decoded as pointers so
`null` is rejected. Unknown fields and trailing data are rejected too, so typos like `"operand"` fail
loudly instead of being ignored, and bodies are capped at 1 KiB.

**Results are always finite.** JSON can't represent `NaN` or `Infinity`, so the calculator checks
every result and returns `RESULT_OUT_OF_RANGE` or `UNDEFINED_RESULT` instead of producing a body the
client can't parse. `0 ^ -1` is reported as division by zero, since that's what it is.

**`percentage` is "a percent of b".** It's the most common meaning on a calculator
(`15 % 200 = 30`). It computes `a × b / 100` rather than `a / 100 × b` because multiplying first
keeps common cases exact: 15% of 200 is exactly `30`, not `30.000000000000004`.

### Backend implementation

**Standard library only.** Go 1.22+'s `net/http` router supports methods and path parameters
(`POST /api/v1/{operation}`), and `log/slog` gives structured logging, so the backend has no
third-party dependencies to audit or update.

**Operations are a table.** Each operation is an entry with its arity and a function. Validation
(arity, finite operands, finite result) is written once in `Calculate`, and the operation list for
`GET /api/v1/operations` and error messages is derived from the same table, so it can't go stale.

**Production defaults.** Read, write and header timeouts protect against slow clients; a recovery
middleware turns a panic into a JSON `500` instead of a dropped connection; shutdown drains in-flight
requests on `SIGTERM`; configuration is validated at startup so a bad `PORT` fails immediately.

**CORS is off by default.** In development the Vite proxy, and in production a reverse proxy, put
the frontend and API on the same origin, so no CORS is needed. When it is, origins are allowed
explicitly with `ALLOWED_ORIGINS`; the server echoes the specific origin and sets `Vary: Origin` so
caches don't mix responses between origins.

### Frontend implementation

**A pure reducer holds all calculator behavior.** Chaining, swapping operators, applying a square
root mid-calculation, recovering from an error and recalling tape values are all state transitions
in `domain/calculator.ts`, tested as plain functions. Separate `plan*` functions decide *when* the
API needs to be called, and the `useCalculator` hook only performs that I/O. The tricky logic never
touches React or the network in tests.

**The entry is a string.** The number being typed is kept as text so intermediate states like `3.`,
`-0` and `0.50` display exactly as typed; it's converted to a number only when sent to the API.

**Input is frozen while a request is in flight, and stale responses are dropped.** Each request has
an `AbortController`; clearing the calculator aborts it, and a late response is ignored. A result can
never land on top of something the person has typed since.

**The API client is injected.** `Calculator` receives a `CalculatorApi`, so component tests use a
small in-memory fake instead of mocking `fetch`, and the real client is tested separately against a
fake `fetch`. The client turns every failure (network down, non-JSON body, unexpected shape) into an
`ApiError`, so the UI deals with exactly one error type.

**Display rounding.** Results are rounded to 12 significant digits for display, so floating-point
noise like `0.1 + 0.2 = 0.30000000000000004` shows as `0.3`, and very large or small numbers switch
to scientific notation. A chained calculation (`2 + 3 ×`) carries the full-precision result forward;
a result reused after `=` or recalled from the tape is the displayed value, as on a physical calculator.

**A paper tape instead of a history list.** Like an adding machine, every calculation is printed,
including failures (in red), which makes it easy to see what happened and to reuse a result. The tape
keeps the 50 most recent lines.

### Trade-offs and limitations

- **64-bit floating point.** Results are IEEE 754 doubles, which is fast and matches JavaScript's
  `number`, but isn't exact decimal arithmetic. Display rounding hides most of the noise; a financial
  calculator would need a decimal type end to end.
- **One request per operation.** Every `=` is a network round trip. For a calculator the latency is
  negligible and it keeps the math in one place; an expression endpoint (`"2 + 3 * 4"`) would cut
  round trips but needs a parser and precedence rules on the server.
- **No authentication or rate limiting.** The API is stateless and cheap. A public deployment should
  put rate limiting in the reverse proxy in front of it.
- **The tape lives in memory.** Reloading the page clears it.
