package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// backupVersion matches BACKUP_VERSION in src/study/backup.ts; the static
// frontend and the server read and write the same file.
const backupVersion = 1

// maxBackupBytes bounds an import body. Years of study is a few MB.
const maxBackupBytes = 32 << 20

type backupAttempt struct {
	attemptRecord
	Items []attemptItem `json:"items"`
}

type backup struct {
	Version    int                 `json:"version"`
	ExportedAt int64               `json:"exportedAt"`
	Baseline   map[string]itemStat `json:"baseline"`
	Attempts   []backupAttempt     `json:"attempts"`
}

func (s *server) exportProgress(w http.ResponseWriter, r *http.Request) {
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		writeError(w, http.StatusBadRequest, "clientId is required")
		return
	}
	out, err := s.buildBackup(clientID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "export failed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) buildBackup(clientID string) (backup, error) {
	baseline, err := s.statsFrom(`item_base`, clientID)
	if err != nil {
		return backup{}, err
	}
	ids, records, err := s.attempts(clientID, 0)
	if err != nil {
		return backup{}, err
	}
	index := make(map[int64]int, len(ids))
	out := backup{
		Version:    backupVersion,
		ExportedAt: time.Now().UnixMilli(),
		Baseline:   baseline,
		Attempts:   make([]backupAttempt, len(records)),
	}
	for i, rec := range records {
		index[ids[i]] = i
		out.Attempts[i] = backupAttempt{attemptRecord: rec, Items: []attemptItem{}}
	}

	rows, err := s.db.Query(`SELECT an.attempt_id, an.item_id, an.mode, an.correct
		FROM answers an JOIN attempts a ON a.id = an.attempt_id
		WHERE a.client_id = ? ORDER BY an.attempt_id, an.rowid`, clientID)
	if err != nil {
		return backup{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var attemptID int64
		var it attemptItem
		if err := rows.Scan(&attemptID, &it.ItemID, &it.Mode, &it.Correct); err != nil {
			return backup{}, err
		}
		if i, ok := index[attemptID]; ok {
			out.Attempts[i].Items = append(out.Attempts[i].Items, it)
		}
	}
	return out, rows.Err()
}

type importReq struct {
	ClientID string `json:"clientId"`
	backup
}

type importResult struct {
	Imported   int `json:"imported"`
	Duplicates int `json:"duplicates"`
	Skipped    int `json:"skipped"`
}

// importProgress merges a backup into a client's history. Sessions already
// present (by uid) are skipped, so importing the same file twice is a no-op;
// sessions for decks that no longer exist are skipped too. Baseline entries
// are only added, never overwritten.
func (s *server) importProgress(w http.ResponseWriter, r *http.Request) {
	var req importReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBackupBytes)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.ClientID == "" {
		writeError(w, http.StatusBadRequest, "clientId is required")
		return
	}
	if req.Version != backupVersion {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported backup version %d", req.Version))
		return
	}
	for i, a := range req.Attempts {
		payload := a.request()
		if a.UID == "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("session %d: uid is required", i+1))
			return
		}
		if msg := payload.validate(); msg != "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("session %d: %s", i+1, msg))
			return
		}
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "begin failed")
		return
	}
	defer tx.Rollback()

	var result importResult
	known := map[string]bool{}
	for _, a := range req.Attempts {
		exists, seen := known[a.DeckID]
		if !seen {
			if exists, err = deckExists(tx, a.DeckID); err != nil {
				writeError(w, http.StatusInternalServerError, "query failed")
				return
			}
			known[a.DeckID] = exists
		}
		if !exists {
			result.Skipped++
			continue
		}
		// Backups carry the time the session happened, whatever it was.
		_, inserted, err := insertAttempt(tx, req.ClientID, a.request(), a.At)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		if inserted {
			result.Imported++
		} else {
			result.Duplicates++
		}
	}
	for id, st := range req.Baseline {
		if id == "" {
			continue
		}
		_, err := tx.Exec(`INSERT INTO item_base
			(client_id, item_id, seen, correct, streak, first_at, last_at, known_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(client_id, item_id) DO NOTHING`,
			req.ClientID, id, st.Seen, st.Correct, st.Streak, st.FirstAt, st.LastAt, st.KnownAt)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "baseline insert failed")
			return
		}
	}
	if err := rebuildItems(tx, req.ClientID, nil); err != nil {
		writeError(w, http.StatusInternalServerError, "item_stats rebuild failed")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "commit failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// request turns a backed-up session into the same shape a live post has, so
// both are validated and inserted by the same code.
func (a backupAttempt) request() attemptReq {
	correct, total, at := a.Correct, a.Total, a.At
	return attemptReq{
		UID:     a.UID,
		DeckID:  a.DeckID,
		Mode:    a.Mode,
		Correct: &correct,
		Total:   &total,
		Kana:    a.Kana,
		Hints:   a.Hints,
		At:      &at,
		Retry:   a.Retry,
		Items:   a.Items,
	}
}
