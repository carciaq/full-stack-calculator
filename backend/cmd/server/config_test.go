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
	if cfg.Addr != ":8080" || cfg.AllowedOrigins != nil || cfg.StaticDir != "" {
		t.Errorf("cfg = %+v, want :8080, no origins and no static dir", cfg)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	cfg, err := loadConfig(env(map[string]string{
		"PORT":            "9000",
		"ALLOWED_ORIGINS": " http://localhost:5173, ,https://calc.example ",
		"STATIC_DIR":      "/srv/www",
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
	if cfg.StaticDir != "/srv/www" {
		t.Errorf("StaticDir = %q, want /srv/www", cfg.StaticDir)
	}
}

func TestLoadConfigRejectsBadPort(t *testing.T) {
	for _, port := range []string{"http", "0", "70000", "-1"} {
		if _, err := loadConfig(env(map[string]string{"PORT": port})); err == nil {
			t.Errorf("PORT=%q: expected an error", port)
		}
	}
}
