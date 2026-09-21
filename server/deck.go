package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"sort"

	"learnjapanese"
)

// Deck mirrors content/decks/*.json. Only the summary fields are parsed; the
// raw JSON is stored as-is so the server never has to understand items,
// questions or furigana markup.
type Deck struct {
	ID      string `json:"id"`
	Level   string `json:"level"`
	Group   string `json:"group"`
	Title   string `json:"title"`
	TitleJa string `json:"titleJa"`
	Order   int    `json:"order"`
	Items   []struct {
		ID string `json:"id"`
	} `json:"items"`

	raw []byte
}

// levelRank orders levels the way the course runs, N5 first, as content.ts
// does. Sorting the level names as text would put N4 first.
func levelRank(level string) int {
	switch level {
	case "N5":
		return 0
	case "N4":
		return 1
	}
	return 2
}

// levelRankSQL is levelRank for ORDER BY on the decks table.
const levelRankSQL = `CASE level WHEN 'N5' THEN 0 WHEN 'N4' THEN 1 ELSE 2 END`

// loadDecks reads every embedded deck, sorted by level then order then id.
func loadDecks() ([]Deck, error) {
	entries, err := fs.Glob(learnjapanese.Decks, "content/decks/*.json")
	if err != nil {
		return nil, err
	}
	decks := make([]Deck, 0, len(entries))
	for _, name := range entries {
		raw, err := fs.ReadFile(learnjapanese.Decks, name)
		if err != nil {
			return nil, err
		}
		var d Deck
		if err := json.Unmarshal(raw, &d); err != nil {
			return nil, fmt.Errorf("%s: %w", path.Base(name), err)
		}
		if d.ID == "" {
			return nil, fmt.Errorf("%s: deck has no id", path.Base(name))
		}
		d.raw = raw
		decks = append(decks, d)
	}
	sortDecks(decks)
	return decks, nil
}

// sortDecks orders decks by level (N5 first), then order, then id.
func sortDecks(decks []Deck) {
	sort.Slice(decks, func(i, j int) bool {
		a, b := decks[i], decks[j]
		if ra, rb := levelRank(a.Level), levelRank(b.Level); ra != rb {
			return ra < rb
		}
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return a.ID < b.ID
	})
}
