package main

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// schema is the original (Phase 4) layout. migrate brings any database, new
// or old, up to date from here, so both paths are exercised on every start.
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
	created_at INTEGER NOT NULL -- unix millis, to match the frontend's Date.now()
);

CREATE INDEX IF NOT EXISTS attempts_client ON attempts(client_id);

CREATE TABLE IF NOT EXISTS item_stats (
	client_id  TEXT NOT NULL,
	item_id    TEXT NOT NULL,
	seen       INTEGER NOT NULL DEFAULT 0,
	correct    INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL, -- unix millis
	PRIMARY KEY (client_id, item_id)
);
`

// openDB opens the SQLite database at path and creates or migrates the schema.
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
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

// migrate adds the answer log and mastery columns. Every step checks before
// it acts, so running it on an up-to-date database changes nothing.
//
//   - attempts gains uid (per session, so a repeat post is ignored), the
//     kana/hints flags, and scope ("custom" for a Custom study session, which
//     has no deck). Old rows get a random uid and scope "deck".
//   - answers holds every individual answer; item_stats is rebuilt from it.
//     skipped marks a test's "I don't know" (stored as correct = 0).
//   - item_base keeps the per-item counts recorded before answers were logged,
//     so rebuilding never loses them.
func migrate(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	add := func(table, column, def string) error {
		has, err := hasColumn(tx, table, column)
		if err != nil || has {
			return err
		}
		_, err = tx.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, def))
		return err
	}
	hadRetry, err := hasColumn(tx, "attempts", "retry")
	if err != nil {
		return err
	}
	for _, c := range []struct{ table, column, def string }{
		{"attempts", "uid", "TEXT"},
		{"attempts", "kana", "INTEGER"},
		{"attempts", "hints", "INTEGER"},
		{"attempts", "retry", "INTEGER NOT NULL DEFAULT 0"},
		{"attempts", "scope", "TEXT NOT NULL DEFAULT 'deck'"},
		{"item_stats", "streak", "INTEGER NOT NULL DEFAULT 0"},
		{"item_stats", "first_at", "INTEGER"},
		{"item_stats", "last_at", "INTEGER"},
		{"item_stats", "known_at", "INTEGER"},
	} {
		if err := add(c.table, c.column, c.def); err != nil {
			return fmt.Errorf("add %s.%s: %w", c.table, c.column, err)
		}
	}

	baseExists, err := hasTable(tx, "item_base")
	if err != nil {
		return err
	}
	stmts := []string{
		`UPDATE attempts SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL`,
		// Unique per client: restoring a backup under a new clientId copies it.
		`CREATE UNIQUE INDEX IF NOT EXISTS attempts_client_uid ON attempts(client_id, uid)`,
		`CREATE TABLE IF NOT EXISTS answers (
			attempt_id INTEGER NOT NULL,
			item_id    TEXT NOT NULL,
			mode       TEXT NOT NULL,
			correct    INTEGER NOT NULL,
			skipped    INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (attempt_id, item_id, mode)
		)`,
		`CREATE TABLE IF NOT EXISTS item_base (
			client_id TEXT NOT NULL,
			item_id   TEXT NOT NULL,
			seen      INTEGER NOT NULL,
			correct   INTEGER NOT NULL,
			streak    INTEGER NOT NULL DEFAULT 0,
			first_at  INTEGER,
			last_at   INTEGER,
			known_at  INTEGER,
			PRIMARY KEY (client_id, item_id)
		)`,
	}
	if !hadRetry {
		// Only the first time: sessions from before the flag. A "Retry missed"
		// run is shorter than a full run of the same deck and mode, so any
		// session shorter than that client's longest one was a retry.
		stmts = append(stmts, `UPDATE attempts SET retry = 1
			WHERE total < (SELECT MAX(b.total) FROM attempts b
				WHERE b.client_id = attempts.client_id
				  AND b.deck_id = attempts.deck_id AND b.mode = attempts.mode)`)
	}
	if !baseExists {
		// Only the first time: whatever item_stats holds now predates answers.
		stmts = append(stmts, `INSERT INTO item_base (client_id, item_id, seen, correct)
			SELECT client_id, item_id, seen, correct FROM item_stats`)
	}
	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			return err
		}
	}
	// After the CREATE above, which a fresh database needs first.
	if err := add("answers", "skipped", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return fmt.Errorf("add answers.skipped: %w", err)
	}
	return tx.Commit()
}

type queryer interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func hasColumn(q queryer, table, column string) (bool, error) {
	rows, err := q.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, table))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notNull, pk int
		var name, typ string
		var def sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notNull, &def, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

func hasTable(q queryer, name string) (bool, error) {
	var n int
	err := q.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&n)
	return n > 0, err
}

// seed upserts every embedded deck into the decks table and removes decks
// that are no longer in the content. It is idempotent: running it twice
// updates rows in place rather than inserting duplicates. Sessions for a
// removed deck stay in attempts; they just no longer match a deck.
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

	ids := make([]any, 0, len(decks))
	for _, d := range decks {
		if _, err := stmt.Exec(d.ID, d.Level, d.Group, d.Title, d.TitleJa, d.Order, string(d.raw)); err != nil {
			return err
		}
		ids = append(ids, d.ID)
	}
	remove := `DELETE FROM decks`
	if len(ids) > 0 {
		remove += ` WHERE id NOT IN (?` + strings.Repeat(`, ?`, len(ids)-1) + `)`
	}
	if _, err := tx.Exec(remove, ids...); err != nil {
		return err
	}
	return tx.Commit()
}

// rebuildItems recomputes item_stats for one client from its baseline plus
// every logged answer, oldest first. With itemIDs it only touches those
// items; with none it rebuilds the client's whole table. Recording a session
// and importing a backup both go through here, so they cannot disagree.
func rebuildItems(tx *sql.Tx, clientID string, itemIDs []string) error {
	filter, args := "", []any{clientID}
	if len(itemIDs) > 0 {
		filter = ` AND item_id IN (?` + strings.Repeat(`, ?`, len(itemIDs)-1) + `)`
		for _, id := range itemIDs {
			args = append(args, id)
		}
	}

	stats := map[string]itemStat{}
	order := []string{}
	touch := func(id string) {
		if _, ok := stats[id]; !ok {
			order = append(order, id)
		}
	}

	rows, err := tx.Query(`SELECT item_id, seen, correct, streak, first_at, last_at, known_at
		FROM item_base WHERE client_id = ?`+filter, args...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var s itemStat
		var first, last, known sql.NullInt64
		if err := rows.Scan(&id, &s.Seen, &s.Correct, &s.Streak, &first, &last, &known); err != nil {
			rows.Close()
			return err
		}
		s.FirstAt, s.LastAt, s.KnownAt = ptr(first), ptr(last), ptr(known)
		touch(id)
		stats[id] = s
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = tx.Query(`SELECT an.item_id, an.correct, a.created_at
		FROM answers an JOIN attempts a ON a.id = an.attempt_id
		WHERE a.client_id = ?`+strings.ReplaceAll(filter, "item_id", "an.item_id")+`
		ORDER BY a.created_at, a.id, an.rowid`, args...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var correct bool
		var at int64
		if err := rows.Scan(&id, &correct, &at); err != nil {
			rows.Close()
			return err
		}
		touch(id)
		stats[id] = stats[id].apply(correct, at)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM item_stats WHERE client_id = ?`+filter, args...); err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	for _, id := range order {
		s := stats[id]
		_, err := tx.Exec(`INSERT INTO item_stats
			(client_id, item_id, seen, correct, streak, first_at, last_at, known_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			clientID, id, s.Seen, s.Correct, s.Streak, s.FirstAt, s.LastAt, s.KnownAt, now)
		if err != nil {
			return err
		}
	}
	return nil
}

func ptr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}
