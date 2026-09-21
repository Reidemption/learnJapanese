package main

// knownStreak mirrors KNOWN_STREAK in src/study/mastery.ts; both are checked
// against testdata/mastery-cases.json.
const knownStreak = 3

// itemStat is one unit's progress. Timestamps are unix millis, nil for counts
// recorded before dates were kept.
type itemStat struct {
	Seen    int    `json:"seen"`
	Correct int    `json:"correct"`
	Streak  int    `json:"streak"`
	FirstAt *int64 `json:"firstAt"`
	LastAt  *int64 `json:"lastAt"`
	KnownAt *int64 `json:"knownAt"`
}

// apply records one answer, the same rule as applyAnswer in mastery.ts.
func (s itemStat) apply(correct bool, at int64) itemStat {
	s.Seen++
	if correct {
		s.Correct++
		s.Streak++
	} else {
		s.Streak = 0
	}
	if s.FirstAt == nil {
		s.FirstAt = &at
	}
	s.LastAt = &at
	if s.KnownAt == nil && s.Streak >= knownStreak {
		s.KnownAt = &at
	}
	return s
}
