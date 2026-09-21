package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	port := env("PORT", "8080")
	dbPath, copiedFrom, err := resolveDBPath(os.Getenv("DB_PATH"), os.UserConfigDir, legacyDBPaths)
	if err != nil {
		log.Fatalf("resolve database path: %v", err)
	}
	if copiedFrom != "" {
		log.Printf("copied existing database %s to %s (the old file is left in place)", copiedFrom, dbPath)
	}

	if dir := filepath.Dir(dbPath); dbPath != ":memory:" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("create %s: %v", dir, err)
		}
	}

	db, err := openDB(dbPath)
	if err != nil {
		log.Fatalf("open db %s: %v", dbPath, err)
	}
	defer db.Close()

	decks, err := loadDecks()
	if err != nil {
		log.Fatalf("load decks: %v", err)
	}
	if err := seed(db, decks); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Printf("seeded %d decks from embedded content", len(decks))

	s := &server{db: db}
	log.Printf("listening on http://localhost:%s (db: %s)", port, dbPath)
	if err := http.ListenAndServe(":"+port, s.routes()); err != nil {
		log.Fatal(err)
	}
}
