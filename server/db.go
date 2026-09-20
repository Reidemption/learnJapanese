package main

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS decks (
	id       TEXT PRIMARY KEY,
	level    TEXT NOT NULL,
	grp      TEXT NOT NULL,
	title    TEXT NOT NULL,
	title_ja TEXT NOT NULL,
	ord      INTEGER NOT NULL,
	json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	client_id  TEXT NOT NULL,
	deck_id    TEXT NOT NULL,
	mode       TEXT NOT NULL,
	correct    INTEGER NOT NULL,
	total      INTEGER NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS attempts_client ON attempts(client_id);

CREATE TABLE IF NOT EXISTS item_stats (
	client_id  TEXT NOT NULL,
	item_id    TEXT NOT NULL,
	seen       INTEGER NOT NULL DEFAULT 0,
	correct    INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (client_id, item_id)
);
`

// openDB opens the SQLite database at path and creates the schema if needed.
func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// modernc.org/sqlite is not safe for concurrent writers on one connection
	// pool; this app is tiny, so serialise everything.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// seed upserts every embedded deck into the decks table. It is idempotent:
// running it twice updates rows in place rather than inserting duplicates.
func seed(db *sql.DB, decks []Deck) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO decks (id, level, grp, title, title_ja, ord, json)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			level = excluded.level,
			grp = excluded.grp,
			title = excluded.title,
			title_ja = excluded.title_ja,
			ord = excluded.ord,
			json = excluded.json`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, d := range decks {
		if _, err := stmt.Exec(d.ID, d.Level, d.Group, d.Title, d.TitleJa, d.Order, string(d.raw)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
