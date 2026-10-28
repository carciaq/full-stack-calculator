// Command server runs the calculator REST API.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/carciaq/full-stack-calculator/backend/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

// run serves until ctx is cancelled, then drains in-flight requests.
func run(ctx context.Context, cfg config, logger *slog.Logger) error {
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           withStatic(httpapi.NewHandler(logger, cfg.AllowedOrigins), cfg.StaticDir),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", cfg.Addr, "allowed_origins", cfg.AllowedOrigins, "static_dir", cfg.StaticDir)
		errs <- srv.ListenAndServe()
	}()

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// withStatic serves the frontend build from dir and sends /api/ and /healthz to api,
// so one process can serve the whole app from a single origin. An empty dir serves the API only.
func withStatic(api http.Handler, dir string) http.Handler {
	if dir == "" {
		return api
	}
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			api.ServeHTTP(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
}
