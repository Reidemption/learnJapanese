package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
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
	mux.HandleFunc("GET /api/progress", s.getProgress)
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
	query += ` ORDER BY level, ord, id`

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

type attemptItem struct {
	ItemID  string `json:"itemId"`
	Correct bool   `json:"correct"`
}

type attemptReq struct {
	ClientID string        `json:"clientId"`
	DeckID   string        `json:"deckId"`
	Mode     string        `json:"mode"`
	Correct  *int          `json:"correct"`
	Total    *int          `json:"total"`
	Items    []attemptItem `json:"items"`
}

// validate returns a human-readable reason the payload is unusable, or "".
func (a attemptReq) validate() string {
	switch {
	case a.ClientID == "":
		return "clientId is required"
	case a.DeckID == "":
		return "deckId is required"
	case a.Mode == "":
		return "mode is required"
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
	for _, it := range a.Items {
		if it.ItemID == "" {
			return "every item needs an itemId"
		}
	}
	return ""
}

func (s *server) postAttempt(w http.ResponseWriter, r *http.Request) {
	var req attemptReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if msg := req.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	var exists int
	err := s.db.QueryRow(`SELECT 1 FROM decks WHERE id = ?`, req.DeckID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "unknown deck: "+req.DeckID)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}

	now := time.Now().UnixMilli()
	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "begin failed")
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO attempts (client_id, deck_id, mode, correct, total, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		req.ClientID, req.DeckID, req.Mode, *req.Correct, *req.Total, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "insert failed")
		return
	}
	id, _ := res.LastInsertId()

	for _, it := range req.Items {
		got := 0
		if it.Correct {
			got = 1
		}
		_, err := tx.Exec(`
			INSERT INTO item_stats (client_id, item_id, seen, correct, updated_at)
			VALUES (?, ?, 1, ?, ?)
			ON CONFLICT(client_id, item_id) DO UPDATE SET
				seen = item_stats.seen + 1,
				correct = item_stats.correct + excluded.correct,
				updated_at = excluded.updated_at`,
			req.ClientID, it.ItemID, got, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "item_stats upsert failed")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "commit failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "at": now})
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

type itemProgress struct {
	Seen    int `json:"seen"`
	Correct int `json:"correct"`
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
// pool is limited to a single connection.
func (s *server) deckProgress(clientID string) (map[string]deckProgress, error) {
	rows, err := s.db.Query(`
		SELECT a.deck_id, a.mode, MAX(a.correct), MAX(a.created_at),
			(SELECT b.correct FROM attempts b
			 WHERE b.client_id = a.client_id AND b.deck_id = a.deck_id AND b.mode = a.mode
			 ORDER BY b.created_at DESC, b.id DESC LIMIT 1),
			(SELECT c.total FROM attempts c
			 WHERE c.client_id = a.client_id AND c.deck_id = a.deck_id AND c.mode = a.mode
			 ORDER BY c.correct DESC, c.created_at DESC, c.id DESC LIMIT 1)
		FROM attempts a WHERE a.client_id = ? GROUP BY a.deck_id, a.mode`, clientID)
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

func (s *server) itemProgress(clientID string) (map[string]itemProgress, error) {
	rows, err := s.db.Query(`SELECT item_id, seen, correct FROM item_stats WHERE client_id = ?`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]itemProgress{}
	for rows.Next() {
		var id string
		var p itemProgress
		if err := rows.Scan(&id, &p.Seen, &p.Correct); err != nil {
			return nil, err
		}
		out[id] = p
	}
	return out, rows.Err()
}
