package main

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var discard = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestRunShutsDownWhenContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, config{Addr: "127.0.0.1:0"}, discard) }()

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run() = %v, want nil after shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run() did not return after the context was cancelled")
	}
}

func TestRunReportsListenErrors(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()

	if err := run(context.Background(), config{Addr: l.Addr().String()}, discard); err == nil {
		t.Fatal("run() on an address in use returned nil, want an error")
	}
}

func TestWithStaticRoutesBetweenAPIAndFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>calc</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	api := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { io.WriteString(w, "api") })
	h := withStatic(api, dir)

	for path, want := range map[string]string{
		"/":                   "<h1>calc</h1>",
		"/api/v1/operations":  "api",
		"/healthz":            "api",
		"/api/v1/unknown/foo": "api",
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || rec.Body.String() != want {
			t.Errorf("GET %s = %d %q, want 200 %q", path, rec.Code, rec.Body.String(), want)
		}
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/missing.js", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("GET /missing.js = %d, want 404", rec.Code)
	}
}

func TestWithStaticWithoutDirServesAPIOnly(t *testing.T) {
	api := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { io.WriteString(w, "api") })
	rec := httptest.NewRecorder()
	withStatic(api, "").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Body.String() != "api" {
		t.Errorf("GET / = %q, want the API handler", rec.Body.String())
	}
}
