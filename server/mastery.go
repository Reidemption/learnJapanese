package main

import "database/sql"

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
	// TestedAt and TestPassed are the unit's most recent test, deck or word;
	// MasteredAt is the first test it passed, never cleared.
	TestedAt   *int64 `json:"testedAt"`
	TestPassed bool   `json:"testPassed"`
	MasteredAt *int64 `json:"masteredAt"`
}

// mastered is the tier above known: the unit's most recent test passed.
func (s itemStat) mastered() bool { return s.TestPassed }

// apply records one answer, the same rule as applyAnswer in mastery.ts.
// testPassed is set on a test answer only: whether the unit passed that
// whole test.
func (s itemStat) apply(correct bool, at int64, testPassed *bool) itemStat {
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
	if testPassed != nil {
		s.TestedAt = &at
		s.TestPassed = *testPassed
		if s.MasteredAt == nil && *testPassed {
			s.MasteredAt = &at
		}
	}
	return s
}

// statColumns are the columns item_stats and item_base share, in the order
// scanStat reads them and statValues writes them.
const statColumns = `seen, correct, streak, first_at, last_at, known_at, tested_at, test_passed, mastered_at`

type scanner interface{ Scan(dest ...any) error }

// scanStat reads an item id followed by statColumns.
func scanStat(row scanner) (string, itemStat, error) {
	var id string
	var s itemStat
	var first, last, known, tested, mastered sql.NullInt64
	err := row.Scan(&id, &s.Seen, &s.Correct, &s.Streak, &first, &last, &known, &tested, &s.TestPassed, &mastered)
	s.FirstAt, s.LastAt, s.KnownAt = ptr(first), ptr(last), ptr(known)
	s.TestedAt, s.MasteredAt = ptr(tested), ptr(mastered)
	return id, s, err
}

// statValues are s's statColumns, for an INSERT.
func (s itemStat) statValues() []any {
	return []any{s.Seen, s.Correct, s.Streak, s.FirstAt, s.LastAt, s.KnownAt, s.TestedAt, s.TestPassed, s.MasteredAt}
}
