package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

type progressBody struct {
	Decks map[string]deckProgress `json:"decks"`
	Items map[string]itemStat     `json:"items"`
}

func progressOf(t *testing.T, h http.Handler, clientID string) progressBody {
	t.Helper()
	w := do(t, h, "GET", "/api/progress?clientId="+clientID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("progress: status = %d (%s)", w.Code, w.Body.String())
	}
	return decode[progressBody](t, w)
}

// attemptBody builds a POST /api/attempts payload; items are "id:mode:ok".
func attemptBody(clientID, uid, deckID string, at int64, items ...[3]string) string {
	type item struct {
		ItemID  string `json:"itemId"`
		Mode    string `json:"mode"`
		Correct bool   `json:"correct"`
	}
	list := []item{}
	correct := 0
	for _, it := range items {
		ok := it[2] == "1"
		if ok {
			correct++
		}
		list = append(list, item{it[0], it[1], ok})
	}
	total := len(items)
	if total == 0 {
		total = 1
	}
	body, _ := json.Marshal(map[string]any{
		"clientId": clientID, "uid": uid, "deckId": deckID, "mode": "meaning",
		"correct": correct, "total": total, "kana": true, "hints": false, "at": at,
		"items": list,
	})
	return string(body)
}

func mustPost(t *testing.T, h http.Handler, body string, want int) {
	t.Helper()
	w := do(t, h, "POST", "/api/attempts", body)
	if w.Code != want {
		t.Fatalf("post: status = %d (%s), want %d", w.Code, w.Body.String(), want)
	}
}

// day is a plausible timestamp: the server ignores anything before 2020.
const day = int64(1_750_000_000_000)

func TestMigrateLegacyDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	deckID := firstDeckID(t)

	// A database exactly as the Phase 4 server left it.
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range []string{
		schema,
		fmt.Sprintf(`INSERT INTO attempts (client_id, deck_id, mode, correct, total, created_at)
			VALUES ('c1', '%s', 'meaning', 3, 4, %d)`, deckID, day),
		fmt.Sprintf(`INSERT INTO item_stats (client_id, item_id, seen, correct, updated_at)
			VALUES ('c1', 'old-item', 5, 2, %d)`, day),
	} {
		if _, err := legacy.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	legacy.Close()

	// Migrating twice must be the same as migrating once.
	for i := 0; i < 2; i++ {
		db, err := openDB(path)
		if err != nil {
			t.Fatalf("open %d: %v", i+1, err)
		}
		if err := migrate(db); err != nil {
			t.Fatalf("migrate again %d: %v", i+1, err)
		}
		db.Close()
	}

	db, err := openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	decks, _ := loadDecks()
	if err := seed(db, decks); err != nil {
		t.Fatal(err)
	}
	s := &server{db: db}
	h := s.routes()

	var baseRows int
	if err := db.QueryRow(`SELECT COUNT(*) FROM item_base`).Scan(&baseRows); err != nil {
		t.Fatal(err)
	}
	if baseRows != 1 {
		t.Fatalf("item_base rows = %d, want 1 (copied once)", baseRows)
	}

	// The old session is still there, now with a uid, and the old counts show.
	w := do(t, h, "GET", "/api/attempts?clientId=c1", "")
	list := decode[[]attemptRecord](t, w)
	if len(list) != 1 || list[0].UID == "" || list[0].Correct != 3 || list[0].Kana != nil {
		t.Fatalf("legacy attempts = %+v", list)
	}
	p := progressOf(t, h, "c1")
	if got := p.Items["old-item"]; got.Seen != 5 || got.Correct != 2 || got.Streak != 0 || got.FirstAt != nil {
		t.Fatalf("old-item = %s, want the legacy counts with no dates", show(got))
	}

	// New answers land on top of the legacy counts rather than replacing them.
	mustPost(t, h, attemptBody("c1", "new", deckID, day+1, [3]string{"old-item", "meaning", "1"}), http.StatusCreated)
	if got := progressOf(t, h, "c1").Items["old-item"]; got.Seen != 6 || got.Correct != 3 || got.Streak != 1 {
		t.Fatalf("old-item after a new answer = %s", show(got))
	}
}

func TestRepeatedUIDIsRecordedOnce(t *testing.T) {
	s, h := newTestServer(t)
	deckID := firstDeckID(t)
	body := attemptBody("c1", "same", deckID, day, [3]string{"i1", "meaning", "1"}, [3]string{"i2", "meaning", "0"})

	mustPost(t, h, body, http.StatusCreated)
	mustPost(t, h, body, http.StatusOK)

	var attempts, answers int
	s.db.QueryRow(`SELECT COUNT(*) FROM attempts`).Scan(&attempts)
	s.db.QueryRow(`SELECT COUNT(*) FROM answers`).Scan(&answers)
	if attempts != 1 || answers != 2 {
		t.Fatalf("attempts = %d, answers = %d; want 1 and 2", attempts, answers)
	}
	if got := progressOf(t, h, "c1").Items["i1"]; got.Seen != 1 {
		t.Fatalf("i1 seen = %d, want 1", got.Seen)
	}

	// The same uid from another client is that client's own session.
	mustPost(t, h, attemptBody("c2", "same", deckID, day), http.StatusCreated)
}

func TestAttemptTimestampAndAnswers(t *testing.T) {
	s, h := newTestServer(t)
	deckID := firstDeckID(t)

	// A plausible client time is kept, e.g. for a session queued offline.
	mustPost(t, h, attemptBody("c1", "a", deckID, day, [3]string{"i1", "reverse", "1"}), http.StatusCreated)
	// A seconds-instead-of-millis mistake falls back to the server's clock.
	before := time.Now().UnixMilli()
	mustPost(t, h, attemptBody("c1", "b", deckID, day/1000), http.StatusCreated)

	w := do(t, h, "GET", "/api/attempts?clientId=c1", "")
	list := decode[[]attemptRecord](t, w)
	if len(list) != 2 || list[0].At != day || list[1].At < before {
		t.Fatalf("attempts = %+v", list)
	}
	if list[0].Kana == nil || !*list[0].Kana || list[0].Hints == nil || *list[0].Hints {
		t.Fatalf("assist flags = %v %v, want kana true, hints false", list[0].Kana, list[0].Hints)
	}

	var mode string
	if err := s.db.QueryRow(`SELECT mode FROM answers WHERE item_id = 'i1'`).Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "reverse" {
		t.Fatalf("answer mode = %q, want the per-answer mode", mode)
	}
	if got := progressOf(t, h, "c1").Items["i1"]; got.FirstAt == nil || *got.FirstAt != day {
		t.Fatalf("i1 = %s, want firstAt = the session time", show(got))
	}

	// One unit answered twice in the same mode in one session is a bug.
	dup := attemptBody("c1", "c", deckID, day, [3]string{"x", "meaning", "1"}, [3]string{"x", "meaning", "0"})
	mustPost(t, h, dup, http.StatusBadRequest)
}

func TestListAttempts(t *testing.T) {
	_, h := newTestServer(t)
	deckID := firstDeckID(t)
	mustPost(t, h, attemptBody("c1", "late", deckID, day+2000), http.StatusCreated)
	mustPost(t, h, attemptBody("c1", "early", deckID, day), http.StatusCreated)
	mustPost(t, h, attemptBody("other", "x", deckID, day), http.StatusCreated)

	w := do(t, h, "GET", "/api/attempts?clientId=c1", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	list := decode[[]attemptRecord](t, w)
	if len(list) != 2 || list[0].UID != "early" || list[1].UID != "late" {
		t.Fatalf("attempts = %+v, want early then late for c1 only", list)
	}

	w = do(t, h, "GET", fmt.Sprintf("/api/attempts?clientId=c1&since=%d", day+1000), "")
	if list := decode[[]attemptRecord](t, w); len(list) != 1 || list[0].UID != "late" {
		t.Fatalf("since filter = %+v", list)
	}

	if w := do(t, h, "GET", "/api/attempts", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("missing clientId: status = %d, want 400", w.Code)
	}
	if w := do(t, h, "GET", "/api/attempts?clientId=c1&since=soon", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("bad since: status = %d, want 400", w.Code)
	}
}

func TestExportImportRoundTrip(t *testing.T) {
	src, h := newTestServer(t)
	deckID := firstDeckID(t)
	// Counts from before answers were logged, as the migration leaves them.
	for _, stmt := range []string{
		`INSERT INTO item_base (client_id, item_id, seen, correct) VALUES ('c1', 'legacy', 4, 1)`,
		`INSERT INTO item_stats (client_id, item_id, seen, correct, updated_at) VALUES ('c1', 'legacy', 4, 1, 0)`,
	} {
		if _, err := src.db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	mustPost(t, h, attemptBody("c1", "a", deckID, day, [3]string{"i1", "meaning", "1"}, [3]string{"i2", "meaning", "0"}), http.StatusCreated)
	mustPost(t, h, attemptBody("c1", "b", deckID, day+10, [3]string{"i1", "meaning", "1"}), http.StatusCreated)
	mustPost(t, h, attemptBody("c1", "c", deckID, day+20, [3]string{"i1", "reverse", "1"}), http.StatusCreated)
	want := progressOf(t, h, "c1")
	if want.Items["i1"].KnownAt == nil {
		t.Fatalf("i1 should be known after three correct answers: %s", show(want.Items["i1"]))
	}

	w := do(t, h, "GET", "/api/export?clientId=c1", "")
	if w.Code != http.StatusOK {
		t.Fatalf("export: status = %d", w.Code)
	}
	exported := w.Body.String()
	b := decode[backup](t, w)
	if b.Version != backupVersion || len(b.Attempts) != 3 || len(b.Attempts[0].Items) != 2 || b.Baseline["legacy"].Seen != 4 {
		t.Fatalf("export = %s", exported)
	}

	// Restore into a fresh database, under a new clientId.
	_, fresh := newTestServer(t)
	body := `{"clientId":"c9",` + exported[1:]
	importOnce := func() importResult {
		t.Helper()
		w := do(t, fresh, "POST", "/api/import", body)
		if w.Code != http.StatusOK {
			t.Fatalf("import: status = %d (%s)", w.Code, w.Body.String())
		}
		return decode[importResult](t, w)
	}
	if got := importOnce(); got != (importResult{Imported: 3}) {
		t.Fatalf("first import = %+v", got)
	}
	got := progressOf(t, fresh, "c9")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("restored progress differs:\n got %+v\nwant %+v", got, want)
	}

	// Importing the same file again changes nothing.
	if got := importOnce(); got != (importResult{Duplicates: 3}) {
		t.Fatalf("second import = %+v", got)
	}
	if again := progressOf(t, fresh, "c9"); !reflect.DeepEqual(again, want) {
		t.Fatalf("progress changed after a repeat import:\n got %+v\nwant %+v", again, want)
	}
}

func TestImportSkipsUnknownDecksAndRejectsJunk(t *testing.T) {
	_, h := newTestServer(t)
	deckID := firstDeckID(t)

	ok := fmt.Sprintf(`{"clientId":"c1","version":1,"attempts":[
		{"uid":"a","deckId":"%s","mode":"meaning","correct":1,"total":1,"at":%d,"items":[{"itemId":"i1","mode":"meaning","correct":true}]},
		{"uid":"b","deckId":"gone","mode":"meaning","correct":1,"total":1,"at":%d,"items":[]}]}`, deckID, day, day)
	w := do(t, h, "POST", "/api/import", ok)
	if got := decode[importResult](t, w); got != (importResult{Imported: 1, Skipped: 1}) {
		t.Fatalf("import = %+v", got)
	}

	tests := []struct{ name, body string }{
		{"not json", `{`},
		{"missing clientId", `{"version":1,"attempts":[]}`},
		{"wrong version", `{"clientId":"c1","version":2,"attempts":[]}`},
		{"missing uid", fmt.Sprintf(`{"clientId":"c1","version":1,"attempts":[{"deckId":"%s","mode":"meaning","correct":1,"total":1,"at":%d}]}`, deckID, day)},
		{"impossible score", fmt.Sprintf(`{"clientId":"c1","version":1,"attempts":[{"uid":"z","deckId":"%s","mode":"meaning","correct":3,"total":1,"at":%d}]}`, deckID, day)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := do(t, h, "POST", "/api/import", tt.body); w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d (%s), want 400", w.Code, w.Body.String())
			}
		})
	}
}
