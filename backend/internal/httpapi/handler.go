// Package httpapi exposes the calculator over a JSON REST API.
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/carciaq/full-stack-calculator/backend/internal/calculator"
)

// maxBodyBytes is far more than any valid request needs.
const maxBodyBytes = 1 << 10

// calculateRequest decodes operands as pointers because encoding/json silently
// turns null into 0 for a plain float64.
type calculateRequest struct {
	Operands []*float64 `json:"operands"`
}

type calculateResponse struct {
	Operation calculator.Operation `json:"operation"`
	Operands  []float64            `json:"operands"`
	Result    float64              `json:"result"`
}

type operationInfo struct {
	Name     calculator.Operation `json:"name"`
	Operands int                  `json:"operands"`
}

type errorBody struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewHandler returns the API with logging, panic recovery and CORS applied.
// Requests from allowedOrigins may call the API from a browser; "*" allows any origin.
func NewHandler(logger *slog.Logger, allowedOrigins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/{operation}", handleCalculate)
	mux.HandleFunc("GET /api/v1/operations", handleOperations)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	return recoverPanics(logger, logRequests(logger, cors(allowedOrigins, mux)))
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	op := calculator.Operation(r.PathValue("operation"))
	if _, ok := calculator.Arity(op); !ok {
		writeError(w, http.StatusNotFound, "UNKNOWN_OPERATION",
			fmt.Sprintf("Unknown operation %q. Supported operations: %s.", op, supportedOperations()))
		return
	}

	operands, ok := decodeOperands(w, r)
	if !ok {
		return
	}

	result, err := calculator.Calculate(op, operands)
	if err != nil {
		status, code, message := describe(err)
		writeError(w, status, code, message)
		return
	}
	writeJSON(w, http.StatusOK, calculateResponse{Operation: op, Operands: operands, Result: result})
}

func handleOperations(w http.ResponseWriter, _ *http.Request) {
	ops := calculator.Operations()
	infos := make([]operationInfo, 0, len(ops))
	for _, op := range ops {
		n, _ := calculator.Arity(op)
		infos = append(infos, operationInfo{Name: op, Operands: n})
	}
	writeJSON(w, http.StatusOK, map[string][]operationInfo{"operations": infos})
}

// decodeOperands reads exactly one JSON object with a required "operands" array of numbers.
// On failure it writes the error response and returns false.
func decodeOperands(w http.ResponseWriter, r *http.Request) ([]float64, bool) {
	var req calculateRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()

	if err := dec.Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "The request body is too large.")
		} else {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT",
				`Request body must be JSON like {"operands": [12, 3]} with finite numbers.`)
		}
		return nil, false
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Request body must contain a single JSON object.")
		return nil, false
	}
	if req.Operands == nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", `The "operands" field is required.`)
		return nil, false
	}
	operands := make([]float64, len(req.Operands))
	for i, x := range req.Operands {
		if x == nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Operands must be numbers, not null.")
			return nil, false
		}
		operands[i] = *x
	}
	return operands, true
}

// describe maps calculator errors to an HTTP status, a stable error code and a readable message.
func describe(err error) (status int, code, message string) {
	switch {
	case errors.Is(err, calculator.ErrOperandCount):
		return http.StatusBadRequest, "INVALID_INPUT", capitalize(err.Error()) + "."
	case errors.Is(err, calculator.ErrInvalidOperand):
		return http.StatusBadRequest, "INVALID_INPUT", "Operands must be finite numbers."
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, "DIVISION_BY_ZERO", "Division by zero is undefined."
	case errors.Is(err, calculator.ErrNegativeSquareRoot):
		return http.StatusUnprocessableEntity, "NEGATIVE_SQUARE_ROOT", "The square root of a negative number is not a real number."
	case errors.Is(err, calculator.ErrOutOfRange):
		return http.StatusUnprocessableEntity, "RESULT_OUT_OF_RANGE", "The result is too large to represent."
	case errors.Is(err, calculator.ErrUndefined):
		return http.StatusUnprocessableEntity, "UNDEFINED_RESULT", "The result is not a real number."
	default:
		return http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong on the server."
	}
}

func supportedOperations() string {
	ops := calculator.Operations()
	names := make([]string, len(ops))
	for i, op := range ops {
		names[i] = string(op)
	}
	return strings.Join(names, ", ")
}

// capitalize upper-cases the first letter of a non-empty ASCII message.
func capitalize(s string) string {
	return strings.ToUpper(s[:1]) + s[1:]
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Error: apiError{Code: code, Message: message}})
}
