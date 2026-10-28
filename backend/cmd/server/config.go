package main

import (
	"fmt"
	"strconv"
	"strings"
)

type config struct {
	Addr           string
	AllowedOrigins []string
}

// loadConfig reads settings from the environment:
//
//	PORT             port to listen on (default 8080)
//	ALLOWED_ORIGINS  comma-separated browser origins allowed by CORS, or "*" (default none)
func loadConfig(getenv func(string) string) (config, error) {
	port := getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return config{}, fmt.Errorf("PORT must be a number between 1 and 65535, got %q", port)
	}

	var origins []string
	for origin := range strings.SplitSeq(getenv("ALLOWED_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}

	return config{Addr: ":" + port, AllowedOrigins: origins}, nil
}
