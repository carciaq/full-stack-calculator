package httpapi

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecoverPanics(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	h := recoverPanics(logger, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if got := decode[errorBody](t, rec).Error.Code; got != "INTERNAL_ERROR" {
		t.Errorf("code = %q, want INTERNAL_ERROR", got)
	}
	if !strings.Contains(logs.String(), "boom") {
		t.Errorf("panic was not logged: %s", logs.String())
	}
}

func TestLogRequests(t *testing.T) {
	var logs bytes.Buffer
	h := NewHandler(slog.New(slog.NewTextHandler(&logs, nil)), nil)

	do(t, h, http.MethodPost, "/api/v1/divide", `{"operands":[1,0]}`)

	for _, want := range []string{"method=POST", "path=/api/v1/divide", "status=422"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("log %q does not contain %q", logs.String(), want)
		}
	}
}

func TestCORS(t *testing.T) {
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), []string{"http://localhost:5173"})

	t.Run("preflight from allowed origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/api/v1/add", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Access-Control-Request-Method", "POST")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusNoContent {
			t.Errorf("status = %d, want 204", rec.Code)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
			t.Errorf("Allow-Origin = %q", got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, "POST") {
			t.Errorf("Allow-Methods = %q, want POST included", got)
		}
	})

	t.Run("request from allowed origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/add", strings.NewReader(`{"operands":[1,2]}`))
		req.Header.Set("Origin", "http://localhost:5173")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
			t.Errorf("status = %d, Allow-Origin = %q", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("other origins get no CORS headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/add", strings.NewReader(`{"operands":[1,2]}`))
		req.Header.Set("Origin", "http://evil.example")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("Allow-Origin = %q, want none", got)
		}
	})

	t.Run("wildcard allows any origin", func(t *testing.T) {
		h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), []string{"*"})
		req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		req.Header.Set("Origin", "http://anywhere.example")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://anywhere.example" {
			t.Errorf("Allow-Origin = %q", got)
		}
	})
}
