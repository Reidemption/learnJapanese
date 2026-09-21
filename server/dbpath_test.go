package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveDBPath(t *testing.T) {
	write := func(t *testing.T, path, body string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	read := func(t *testing.T, path string) string {
		t.Helper()
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}

	t.Run("an explicit DB_PATH wins", func(t *testing.T) {
		got, copied, err := resolveDBPath("custom.db", func() (string, error) { return t.TempDir(), nil }, nil)
		if err != nil || got != "custom.db" || copied != "" {
			t.Fatalf("got %q %q %v", got, copied, err)
		}
	})

	t.Run("the default lives under the user config dir", func(t *testing.T) {
		config := t.TempDir()
		got, copied, err := resolveDBPath("", func() (string, error) { return config, nil },
			[]string{filepath.Join(t.TempDir(), "missing.db")})
		want := filepath.Join(config, "learnjapanese", "app.db")
		if err != nil || got != want || copied != "" {
			t.Fatalf("got %q %q %v, want %q", got, copied, err, want)
		}
	})

	t.Run("a legacy database is copied once", func(t *testing.T) {
		config, work := t.TempDir(), t.TempDir()
		first := filepath.Join(work, "data", "app.db")
		second := filepath.Join(work, "server", "data", "app.db")
		write(t, second, "server-dir progress")
		legacy := []string{first, second}
		cfg := func() (string, error) { return config, nil }

		got, copied, err := resolveDBPath("", cfg, legacy)
		if err != nil || copied != second || read(t, got) != "server-dir progress" {
			t.Fatalf("got %q copied from %q: %v", got, copied, err)
		}

		// Later starts use the copy, even if a legacy file changes or appears.
		write(t, first, "newer junk")
		again, copied, err := resolveDBPath("", cfg, legacy)
		if err != nil || again != got || copied != "" || read(t, again) != "server-dir progress" {
			t.Fatalf("second start: %q copied from %q: %v", again, copied, err)
		}
	})

	t.Run("an existing target is never overwritten", func(t *testing.T) {
		config, work := t.TempDir(), t.TempDir()
		target := filepath.Join(config, "learnjapanese", "app.db")
		write(t, target, "current")
		old := filepath.Join(work, "app.db")
		write(t, old, "old")
		got, copied, err := resolveDBPath("", func() (string, error) { return config, nil }, []string{old})
		if err != nil || copied != "" || read(t, got) != "current" {
			t.Fatalf("got %q copied from %q: %v", got, copied, err)
		}
	})

	t.Run("no config dir falls back to the old relative default", func(t *testing.T) {
		legacy := []string{filepath.Join("data", "app.db")}
		got, _, err := resolveDBPath("", func() (string, error) { return "", errors.New("no home") }, legacy)
		if err != nil || got != legacy[0] {
			t.Fatalf("got %q: %v", got, err)
		}
	})
}
