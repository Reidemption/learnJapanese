package main

import "testing"

func TestLoadDecks(t *testing.T) {
	decks, err := loadDecks()
	if err != nil {
		t.Fatalf("load decks: %v", err)
	}
	if len(decks) == 0 {
		t.Fatal("no decks embedded — is content/decks/*.json reachable?")
	}
	seen := map[string]bool{}
	for _, d := range decks {
		if seen[d.ID] {
			t.Errorf("duplicate deck id %q", d.ID)
		}
		seen[d.ID] = true
		if d.Level == "" || d.Group == "" || d.Title == "" {
			t.Errorf("deck %q is missing summary fields", d.ID)
		}
		if len(d.raw) == 0 {
			t.Errorf("deck %q has no raw JSON", d.ID)
		}
	}
}

func TestSeedIsIdempotent(t *testing.T) {
	db, err := openDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	decks, err := loadDecks()
	if err != nil {
		t.Fatal(err)
	}

	count := func() int {
		t.Helper()
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM decks`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	if err := seed(db, decks); err != nil {
		t.Fatalf("first seed: %v", err)
	}
	first := count()
	if first != len(decks) {
		t.Fatalf("after one seed: %d rows, want %d", first, len(decks))
	}

	if err := seed(db, decks); err != nil {
		t.Fatalf("second seed: %v", err)
	}
	if second := count(); second != first {
		t.Fatalf("after two seeds: %d rows, want %d", second, first)
	}
}

func TestSeedUpdatesInPlace(t *testing.T) {
	db, err := openDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	decks, err := loadDecks()
	if err != nil {
		t.Fatal(err)
	}
	if err := seed(db, decks); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE decks SET title = 'stale' WHERE id = ?`, decks[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := seed(db, decks); err != nil {
		t.Fatal(err)
	}
	var title string
	if err := db.QueryRow(`SELECT title FROM decks WHERE id = ?`, decks[0].ID).Scan(&title); err != nil {
		t.Fatal(err)
	}
	if title != decks[0].Title {
		t.Fatalf("title = %q, want %q", title, decks[0].Title)
	}
}
