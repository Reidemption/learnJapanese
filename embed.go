// Package learnjapanese exists only to embed the study content, which lives at
// the repo root. go:embed cannot reach outside its own directory, so the module
// root (not server/) owns the embedded FS and server/ imports it.
package learnjapanese

import "embed"

// Decks holds the deck JSON files under content/decks.
//
//go:embed content/decks/*.json
var Decks embed.FS
