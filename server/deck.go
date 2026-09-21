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
	sort.Slice(decks, func(i, j int) bool {
		a, b := decks[i], decks[j]
		if a.Level != b.Level {
			return a.Level < b.Level
		}
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return a.ID < b.ID
	})
	return decks, nil
}
