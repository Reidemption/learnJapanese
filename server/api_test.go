package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// newTestServer gives each test a seeded in-memory database.
func newTestServer(t *testing.T) (*server, http.Handler) {
	t.Helper()
	db, err := openDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	decks, err := loadDecks()
	if err != nil {
		t.Fatalf("load decks: %v", err)
	}
	if err := seed(db, decks); err != nil {
		t.Fatalf("seed: %v", err)
	}
	s := &server{db: db}
	return s, s.routes()
}

func do(t *testing.T, h http.Handler, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %s: %v", w.Body.String(), err)
	}
	return v
}

// firstDeckID is a stable handle on real content without hard-coding a slug.
func firstDeckID(t *testing.T) string {
	t.Helper()
	decks, err := loadDecks()
	if err != nil || len(decks) == 0 {
		t.Fatalf("no decks loaded: %v", err)
	}
	return decks[0].ID
}

func TestHealth(t *testing.T) {
	_, h := newTestServer(t)
	w := do(t, h, "GET", "/api/health", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	got := decode[map[string]string](t, w)
	if got["status"] != "ok" {
		t.Fatalf("status = %q, want ok", got["status"])
	}
}

func TestListDecks(t *testing.T) {
	_, h := newTestServer(t)
	all, err := loadDecks()
	if err != nil {
		t.Fatal(err)
	}

	w := do(t, h, "GET", "/api/decks", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	got := decode[[]deckSummary](t, w)
	if len(got) != len(all) {
		t.Fatalf("got %d decks, want %d", len(got), len(all))
	}
	if got[0].ItemCount == 0 {
		t.Errorf("first deck %s has itemCount 0", got[0].ID)
	}
	// Summaries must not carry items.
	raw := decode[[]map[string]any](t, w)
	if _, ok := raw[0]["items"]; ok {
		t.Error("summary should not include items")
	}
}

func TestListDecksByLevel(t *testing.T) {
	_, h := newTestServer(t)

	tests := []struct {
		level    string
		wantSome bool
	}{
		{"N5", true},
		{"N9", false},
	}
	for _, tt := range tests {
		t.Run(tt.level, func(t *testing.T) {
			w := do(t, h, "GET", "/api/decks?level="+tt.level, "")
			if w.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", w.Code)
			}
			got := decode[[]deckSummary](t, w)
			if tt.wantSome && len(got) == 0 {
				t.Fatal("expected decks, got none")
			}
			if !tt.wantSome && len(got) != 0 {
				t.Fatalf("expected no decks, got %d", len(got))
			}
			for _, d := range got {
				if d.Level != tt.level {
					t.Errorf("deck %s has level %s", d.ID, d.Level)
				}
			}
		})
	}
}

func TestGetDeck(t *testing.T) {
	_, h := newTestServer(t)
	id := firstDeckID(t)

	w := do(t, h, "GET", "/api/decks/"+id, "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	got := decode[Deck](t, w)
	if got.ID != id {
		t.Fatalf("id = %q, want %q", got.ID, id)
	}
	if len(got.Items) == 0 {
		t.Error("full deck should carry items")
	}
}

func TestGetDeckUnknown(t *testing.T) {
	_, h := newTestServer(t)
	w := do(t, h, "GET", "/api/decks/nope", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestPostAttemptAndProgress(t *testing.T) {
	_, h := newTestServer(t)
	id := firstDeckID(t)

	post := func(correct int) {
		t.Helper()
		body := `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","correct":` +
			strconv.Itoa(correct) + `,"total":10,"items":[{"itemId":"i1","correct":true},{"itemId":"i2","correct":false}]}`
		w := do(t, h, "POST", "/api/attempts", body)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d (%s), want 201", w.Code, w.Body.String())
		}
	}
	post(8)
	post(6)

	w := do(t, h, "GET", "/api/progress?clientId=c1", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got struct {
		Decks map[string]deckProgress `json:"decks"`
		Items map[string]itemProgress `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	key := id + ":meaning"
	if p := got.Decks[key]; p.Best != 8 || p.Last != 6 || p.At == "" {
		t.Fatalf("%s = %+v, want best 8 last 6 with a timestamp", key, p)
	}
	if p := got.Items["i1"]; p.Seen != 2 || p.Correct != 2 {
		t.Errorf("i1 = %+v, want seen 2 correct 2", p)
	}
	if p := got.Items["i2"]; p.Seen != 2 || p.Correct != 0 {
		t.Errorf("i2 = %+v, want seen 2 correct 0", p)
	}
}

func TestProgressEmptyClient(t *testing.T) {
	_, h := newTestServer(t)

	w := do(t, h, "GET", "/api/progress?clientId=nobody", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got struct {
		Decks map[string]deckProgress `json:"decks"`
		Items map[string]itemProgress `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Decks) != 0 || len(got.Items) != 0 {
		t.Fatalf("expected empty progress, got %+v", got)
	}

	if w := do(t, h, "GET", "/api/progress", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("missing clientId: status = %d, want 400", w.Code)
	}
}

func TestPostAttemptBadPayload(t *testing.T) {
	s, h := newTestServer(t)
	id := firstDeckID(t)

	tests := []struct {
		name string
		body string
	}{
		{"not json", `{`},
		{"missing clientId", `{"deckId":"` + id + `","mode":"meaning","correct":1,"total":2}`},
		{"missing deckId", `{"clientId":"c1","mode":"meaning","correct":1,"total":2}`},
		{"missing mode", `{"clientId":"c1","deckId":"` + id + `","correct":1,"total":2}`},
		{"missing correct", `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","total":2}`},
		{"missing total", `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","correct":1}`},
		{"zero total", `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","correct":0,"total":0}`},
		{"negative correct", `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","correct":-1,"total":2}`},
		{"correct > total", `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","correct":5,"total":2}`},
		{"unknown deck", `{"clientId":"c1","deckId":"nope","mode":"meaning","correct":1,"total":2}`},
		{"item without id", `{"clientId":"c1","deckId":"` + id + `","mode":"meaning","correct":1,"total":2,"items":[{"correct":true}]}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := do(t, h, "POST", "/api/attempts", tt.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d (%s), want 400", w.Code, w.Body.String())
			}
		})
	}

	// Nothing should have been recorded.
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM attempts`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("attempts = %d, want 0", n)
	}
}

func TestCORSForDevOrigin(t *testing.T) {
	_, h := newTestServer(t)
	r := httptest.NewRequest("GET", "/api/health", nil)
	r.Header.Set("Origin", devOrigin)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != devOrigin {
		t.Fatalf("allow-origin = %q, want %q", got, devOrigin)
	}
}

