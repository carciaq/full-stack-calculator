package main

import (
	"slices"
	"testing"
)

func env(vars map[string]string) func(string) string {
	return func(key string) string { return vars[key] }
}

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := loadConfig(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != ":8080" || cfg.AllowedOrigins != nil {
		t.Errorf("cfg = %+v, want :8080 and no origins", cfg)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	cfg, err := loadConfig(env(map[string]string{
		"PORT":            "9000",
		"ALLOWED_ORIGINS": " http://localhost:5173, ,https://calc.example ",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != ":9000" {
		t.Errorf("Addr = %q, want :9000", cfg.Addr)
	}
	if want := []string{"http://localhost:5173", "https://calc.example"}; !slices.Equal(cfg.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
	}
}

func TestLoadConfigRejectsBadPort(t *testing.T) {
	for _, port := range []string{"http", "0", "70000", "-1"} {
		if _, err := loadConfig(env(map[string]string{"PORT": port})); err == nil {
			t.Errorf("PORT=%q: expected an error", port)
		}
	}
}
