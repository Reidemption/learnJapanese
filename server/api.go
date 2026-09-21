package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"
)

type server struct {
	db *sql.DB
}

// devOrigin is the Vite dev server; the frontend is served from elsewhere in
// production, so this stays a single hard-coded allowance.
const devOrigin = "http://localhost:5173"

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/decks", s.listDecks)
	mux.HandleFunc("GET /api/decks/{id}", s.getDeck)
	mux.HandleFunc("POST /api/attempts", s.postAttempt)
	mux.HandleFunc("GET /api/attempts", s.listAttempts)
	mux.HandleFunc("GET /api/progress", s.getProgress)
	mux.HandleFunc("GET /api/export", s.exportProgress)
	mux.HandleFunc("POST /api/import", s.importProgress)
	return cors(mux)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") == devOrigin {
			w.Header().Set("Access-Control-Allow-Origin", devOrigin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// deckSummary is a deck without its items or questions.
type deckSummary struct {
	ID        string `json:"id"`
	Level     string `json:"level"`
	Group     string `json:"group"`
	Title     string `json:"title"`
	TitleJa   string `json:"titleJa"`
	Order     int    `json:"order"`
	ItemCount int    `json:"itemCount"`
}

func (s *server) listDecks(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, level, grp, title, title_ja, ord, json FROM decks`
	args := []any{}
	if level := r.URL.Query().Get("level"); level != "" {
		query += ` WHERE level = ?`
		args = append(args, level)
	}
	query += ` ORDER BY ` + levelRankSQL + `, ord, id`

	rows, err := s.db.Query(query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	out := []deckSummary{}
	for rows.Next() {
		var d deckSummary
		var raw string
		if err := rows.Scan(&d.ID, &d.Level, &d.Group, &d.Title, &d.TitleJa, &d.Order, &raw); err != nil {
			writeError(w, http.StatusInternalServerError, "scan failed")
			return
		}
		var parsed Deck
		if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
			d.ItemCount = len(parsed.Items)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) getDeck(w http.ResponseWriter, r *http.Request) {
	var raw string
	err := s.db.QueryRow(`SELECT json FROM decks WHERE id = ?`, r.PathValue("id")).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "deck not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	// The stored JSON is served verbatim; the server never rewrites content.
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write([]byte(raw))
}

// modes are the study modes a session or an answer can be in, as in
// src/study/modes.ts.
var modes = map[string]bool{"meaning": true, "reverse": true, "reading": true, "cloze": true}

type attemptItem struct {
	ItemID string `json:"itemId"`
	// Mode defaults to the session's mode; a mixed session (a test) sets it.
	Mode    string `json:"mode,omitempty"`
	Correct bool   `json:"correct"`
}

type attemptReq struct {
	ClientID string `json:"clientId"`
	// UID identifies the session, so posting it twice records it once. Old
	// clients (and queued posts from before uids) omit it.
	UID     string `json:"uid"`
	DeckID  string `json:"deckId"`
	Mode    string `json:"mode"`
	Correct *int   `json:"correct"`
	Total   *int   `json:"total"`
	Kana    *bool  `json:"kana"`
	Hints   *bool  `json:"hints"`
	At      *int64 `json:"at"`
	// Retry marks a "Retry missed" run: its answers count, but it is not a
	// score for the deck.
	Retry bool          `json:"retry"`
	Items []attemptItem `json:"items"`
}

// validate returns a human-readable reason the payload is unusable, or "".
// The clientId is checked by the caller, since an import carries it once.
func (a attemptReq) validate() string {
	switch {
	case a.DeckID == "":
		return "deckId is required"
	case a.Mode == "":
		return "mode is required"
	case !modes[a.Mode]:
		return "unknown mode: " + a.Mode
	case a.Correct == nil:
		return "correct is required"
	case a.Total == nil:
		return "total is required"
	case *a.Total <= 0:
		return "total must be positive"
	case *a.Correct < 0:
		return "correct must not be negative"
	case *a.Correct > *a.Total:
		return "correct must not exceed total"
	}
	seen := map[string]bool{}
	for _, it := range a.Items {
		if it.ItemID == "" {
			return "every item needs an itemId"
		}
		if it.Mode != "" && !modes[it.Mode] {
			return "unknown mode for " + it.ItemID + ": " + it.Mode
		}
		key := it.ItemID + "\x00" + it.Mode
		if seen[key] {
			return "duplicate answer for " + it.ItemID
		}
		seen[key] = true
	}
	return ""
}

// earliestAt is 2020-01-01: anything before it is a seconds-vs-millis bug or
// junk, not a real session.
const earliestAt = 1577836800000

// timestamp is the client's `at` when it is plausible, else now. Clients send
// it so a session queued offline keeps the time it was actually studied.
func (a attemptReq) timestamp(now int64) int64 {
	if a.At != nil && *a.At >= earliestAt && *a.At <= now+24*60*60*1000 {
		return *a.At
	}
	return now
}

func deckExists(q queryer, id string) (bool, error) {
	var n int
	err := q.QueryRow(`SELECT COUNT(*) FROM decks WHERE id = ?`, id).Scan(&n)
	return n > 0, err
}

// insertAttempt stores a session and its answers. A uid this client already
// posted is not an error: it returns the existing row with inserted = false.
func insertAttempt(tx *sql.Tx, clientID string, req attemptReq, at int64) (id int64, inserted bool, err error) {
	uid := req.UID
	if uid != "" {
		err = tx.QueryRow(`SELECT id FROM attempts WHERE client_id = ? AND uid = ?`, clientID, uid).Scan(&id)
		if err == nil {
			return id, false, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return 0, false, err
		}
	} else {
		if err = tx.QueryRow(`SELECT lower(hex(randomblob(16)))`).Scan(&uid); err != nil {
			return 0, false, err
		}
	}

	res, err := tx.Exec(`INSERT INTO attempts
		(client_id, uid, deck_id, mode, correct, total, kana, hints, retry, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		clientID, uid, req.DeckID, req.Mode, *req.Correct, *req.Total, req.Kana, req.Hints, req.Retry, at)
	if err != nil {
		return 0, false, err
	}
	if id, err = res.LastInsertId(); err != nil {
		return 0, false, err
	}
	for _, it := range req.Items {
		mode := it.Mode
		if mode == "" {
			mode = req.Mode
		}
		if _, err := tx.Exec(`INSERT INTO answers (attempt_id, item_id, mode, correct) VALUES (?, ?, ?, ?)`,
			id, it.ItemID, mode, it.Correct); err != nil {
			return 0, false, err
		}
	}
	return id, true, nil
}

func (s *server) postAttempt(w http.ResponseWriter, r *http.Request) {
	var req attemptReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.ClientID == "" {
		writeError(w, http.StatusBadRequest, "clientId is required")
		return
	}
	if msg := req.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	ok, err := deckExists(s.db, req.DeckID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown deck: "+req.DeckID)
		return
	}

	at := req.timestamp(time.Now().UnixMilli())
	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "begin failed")
		return
	}
	defer tx.Rollback()

	id, inserted, err := insertAttempt(tx, req.ClientID, req, at)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "insert failed")
		return
	}
	if !inserted {
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "duplicate": true})
		return
	}
	ids := make([]string, 0, len(req.Items))
	for _, it := range req.Items {
		ids = append(ids, it.ItemID)
	}
	if len(ids) > 0 {
		if err := rebuildItems(tx, req.ClientID, ids); err != nil {
			writeError(w, http.StatusInternalServerError, "item_stats rebuild failed")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "commit failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "at": at})
}

// attemptRecord is one session as listed back. kana/hints are null for
// sessions recorded before the flags existed.
type attemptRecord struct {
	UID     string `json:"uid"`
	DeckID  string `json:"deckId"`
	Mode    string `json:"mode"`
	Correct int    `json:"correct"`
	Total   int    `json:"total"`
	Kana    *bool  `json:"kana"`
	Hints   *bool  `json:"hints"`
	At      int64  `json:"at"`
	Retry   bool   `json:"retry,omitempty"`
}

// attempts returns a client's sessions from since onwards, oldest first.
func (s *server) attempts(clientID string, since int64) ([]int64, []attemptRecord, error) {
	rows, err := s.db.Query(`SELECT id, uid, deck_id, mode, correct, total, kana, hints, retry, created_at
		FROM attempts WHERE client_id = ? AND created_at >= ? ORDER BY created_at, id`, clientID, since)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	ids, out := []int64{}, []attemptRecord{}
	for rows.Next() {
		var id int64
		var a attemptRecord
		var kana, hints sql.NullBool
		if err := rows.Scan(&id, &a.UID, &a.DeckID, &a.Mode, &a.Correct, &a.Total, &kana, &hints, &a.Retry, &a.At); err != nil {
			return nil, nil, err
		}
		if kana.Valid {
			a.Kana = &kana.Bool
		}
		if hints.Valid {
			a.Hints = &hints.Bool
		}
		ids = append(ids, id)
		out = append(out, a)
	}
	return ids, out, rows.Err()
}

func (s *server) listAttempts(w http.ResponseWriter, r *http.Request) {
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		writeError(w, http.StatusBadRequest, "clientId is required")
		return
	}
	var since int64
	if v := r.URL.Query().Get("since"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "since must be unix millis")
			return
		}
		since = n
	}
	_, out, err := s.attempts(clientID, since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// deckProgress mirrors the frontend's ModeScore, field for field, so HTTP mode
// and static (localStorage) mode are interchangeable. `At` is unix millis,
// which is what Date.now() gives the static implementation.
type deckProgress struct {
	Best  int   `json:"best"`
	Last  int   `json:"last"`
	Total int   `json:"total"`
	At    int64 `json:"at"`
}

func (s *server) getProgress(w http.ResponseWriter, r *http.Request) {
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		writeError(w, http.StatusBadRequest, "clientId is required")
		return
	}

	decks, err := s.deckProgress(clientID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	items, err := s.itemProgress(clientID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"decks": decks, "items": items})
}

// deckProgress collects the best and most recent score per deck+mode. The
// correlated subquery keeps this to one round trip, which matters because the
// pool is limited to a single connection. Retry runs cover only the questions
// just missed, so they are not scores and are left out.
func (s *server) deckProgress(clientID string) (map[string]deckProgress, error) {
	rows, err := s.db.Query(`
		SELECT a.deck_id, a.mode, MAX(a.correct), MAX(a.created_at),
			(SELECT b.correct FROM attempts b
			 WHERE b.client_id = a.client_id AND b.deck_id = a.deck_id AND b.mode = a.mode
			   AND b.retry = 0
			 ORDER BY b.created_at DESC, b.id DESC LIMIT 1),
			(SELECT c.total FROM attempts c
			 WHERE c.client_id = a.client_id AND c.deck_id = a.deck_id AND c.mode = a.mode
			   AND c.retry = 0
			 ORDER BY c.correct DESC, c.created_at DESC, c.id DESC LIMIT 1)
		FROM attempts a WHERE a.client_id = ? AND a.retry = 0
		GROUP BY a.deck_id, a.mode`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]deckProgress{}
	for rows.Next() {
		var deckID, mode string
		var p deckProgress
		if err := rows.Scan(&deckID, &mode, &p.Best, &p.At, &p.Last, &p.Total); err != nil {
			return nil, err
		}
		out[deckID+":"+mode] = p
	}
	return out, rows.Err()
}

func (s *server) itemProgress(clientID string) (map[string]itemStat, error) {
	return s.statsFrom(`item_stats`, clientID)
}

// statsFrom reads item_stats or item_base, which share their columns.
func (s *server) statsFrom(table, clientID string) (map[string]itemStat, error) {
	rows, err := s.db.Query(`SELECT item_id, seen, correct, streak, first_at, last_at, known_at
		FROM `+table+` WHERE client_id = ?`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]itemStat{}
	for rows.Next() {
		var id string
		var p itemStat
		var first, last, known sql.NullInt64
		if err := rows.Scan(&id, &p.Seen, &p.Correct, &p.Streak, &first, &last, &known); err != nil {
			return nil, err
		}
		p.FirstAt, p.LastAt, p.KnownAt = ptr(first), ptr(last), ptr(known)
		out[id] = p
	}
	return out, rows.Err()
}
