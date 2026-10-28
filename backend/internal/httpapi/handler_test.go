package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestHandler(origins ...string) http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), origins)
}

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return v
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		path string
		body string
		want float64
	}{
		{"/api/v1/add", `{"operands":[12,3]}`, 15},
		{"/api/v1/subtract", `{"operands":[3,12]}`, -9},
		{"/api/v1/multiply", `{"operands":[2.5,4]}`, 10},
		{"/api/v1/divide", `{"operands":[6,3]}`, 2},
		{"/api/v1/power", `{"operands":[2,8]}`, 256},
		{"/api/v1/percentage", `{"operands":[15,200]}`, 30},
		{"/api/v1/sqrt", `{"operands":[81]}`, 9},
	}
	h := newTestHandler()
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			rec := do(t, h, http.MethodPost, tt.path, tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
			}
			got := decode[calculateResponse](t, rec)
			if got.Result != tt.want {
				t.Errorf("result = %v, want %v", got.Result, tt.want)
			}
			if string(got.Operation) != strings.TrimPrefix(tt.path, "/api/v1/") {
				t.Errorf("operation = %q, want it to echo the path", got.Operation)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"division by zero", "/api/v1/divide", `{"operands":[8,0]}`, 422, "DIVISION_BY_ZERO"},
		{"negative square root", "/api/v1/sqrt", `{"operands":[-4]}`, 422, "NEGATIVE_SQUARE_ROOT"},
		{"overflow", "/api/v1/power", `{"operands":[10,400]}`, 422, "RESULT_OUT_OF_RANGE"},
		{"not a real number", "/api/v1/power", `{"operands":[-8,0.5]}`, 422, "UNDEFINED_RESULT"},
		{"unknown operation", "/api/v1/modulo", `{"operands":[8,3]}`, 404, "UNKNOWN_OPERATION"},
		{"wrong operand count", "/api/v1/add", `{"operands":[1]}`, 400, "INVALID_INPUT"},
		{"missing operands", "/api/v1/add", `{}`, 400, "INVALID_INPUT"},
		{"string operand", "/api/v1/add", `{"operands":["1",2]}`, 400, "INVALID_INPUT"},
		{"null operand", "/api/v1/add", `{"operands":[null,2]}`, 400, "INVALID_INPUT"},
		{"number too large for float64", "/api/v1/add", `{"operands":[1e400,2]}`, 400, "INVALID_INPUT"},
		{"malformed JSON", "/api/v1/add", `{"operands":[1,`, 400, "INVALID_INPUT"},
		{"empty body", "/api/v1/add", ``, 400, "INVALID_INPUT"},
		{"unknown field", "/api/v1/add", `{"operands":[1,2],"extra":true}`, 400, "INVALID_INPUT"},
		{"trailing data", "/api/v1/add", `{"operands":[1,2]} {"operands":[3,4]}`, 400, "INVALID_INPUT"},
		{"body too large", "/api/v1/add", `{"operands":[` + strings.Repeat("1,", maxBodyBytes) + `1]}`, 413, "REQUEST_TOO_LARGE"},
	}
	h := newTestHandler()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, h, http.MethodPost, tt.path, tt.body)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body %s", rec.Code, tt.wantStatus, rec.Body)
			}
			got := decode[errorBody](t, rec)
			if got.Error.Code != tt.wantCode {
				t.Errorf("code = %q, want %q", got.Error.Code, tt.wantCode)
			}
			if got.Error.Message == "" {
				t.Error("error message is empty")
			}
		})
	}
}

func TestOperandCountMessage(t *testing.T) {
	rec := do(t, newTestHandler(), http.MethodPost, "/api/v1/sqrt", `{"operands":[4,9]}`)
	got := decode[errorBody](t, rec)
	if want := "Wrong number of operands: sqrt takes 1, got 2."; got.Error.Message != want {
		t.Errorf("message = %q, want %q", got.Error.Message, want)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	rec := do(t, newTestHandler(), http.MethodGet, "/api/v1/add", "")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestOperations(t *testing.T) {
	rec := do(t, newTestHandler(), http.MethodGet, "/api/v1/operations", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	got := decode[map[string][]operationInfo](t, rec)["operations"]
	if len(got) != 7 {
		t.Fatalf("got %d operations, want 7: %v", len(got), got)
	}
	if got[0] != (operationInfo{Name: "add", Operands: 2}) {
		t.Errorf("first operation = %+v, want add with 2 operands", got[0])
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, newTestHandler(), http.MethodGet, "/healthz", "")
	if got := decode[map[string]string](t, rec); rec.Code != http.StatusOK || got["status"] != "ok" {
		t.Errorf("healthz = %d %v, want 200 ok", rec.Code, got)
	}
}

func TestDescribeUnknownError(t *testing.T) {
	status, code, _ := describe(errors.New("unexpected"))
	if status != http.StatusInternalServerError || code != "INTERNAL_ERROR" {
		t.Errorf("describe(unexpected) = %d %q, want 500 INTERNAL_ERROR", status, code)
	}
}
