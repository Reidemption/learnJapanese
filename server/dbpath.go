package main

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// legacyDBPaths are where the default database used to land: DB_PATH was
// relative, so `go run .` in server/ and `go run ./server` at the repo root
// each wrote their own data/app.db.
var legacyDBPaths = []string{
	filepath.Join("data", "app.db"),
	filepath.Join("server", "data", "app.db"),
}

// resolveDBPath picks the database file. An explicit DB_PATH always wins.
// Otherwise it is <user config dir>/learnjapanese/app.db, which does not
// depend on the working directory and lives outside the repo. The first time
// that file is missing, the first legacy database found is copied there;
// copiedFrom names it. An existing target is never overwritten.
func resolveDBPath(explicit string, configDir func() (string, error), legacy []string) (path, copiedFrom string, err error) {
	if explicit != "" {
		return explicit, "", nil
	}
	dir, err := configDir()
	if err != nil {
		// No config dir (unusual): keep the old relative default.
		return legacy[0], "", nil
	}
	target := filepath.Join(dir, "learnjapanese", "app.db")
	if _, err := os.Stat(target); err == nil {
		return target, "", nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", "", err
	}
	for _, old := range legacy {
		info, err := os.Stat(old)
		if err != nil || info.IsDir() {
			continue
		}
		if err := copyFile(old, target); err != nil {
			return "", "", err
		}
		return target, old, nil
	}
	return target, "", nil
}

func copyFile(from, to string) error {
	if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
		return err
	}
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	// O_EXCL: never clobber a database that appeared in the meantime.
	out, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(to)
		return err
	}
	return out.Close()
}
