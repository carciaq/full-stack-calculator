package main

import (
	"context"
	"io"
	"log/slog"
	"net"
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
