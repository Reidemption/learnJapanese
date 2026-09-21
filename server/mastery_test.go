package main

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The same fixture drives src/study/mastery.test.ts, so the two
// implementations of the rule cannot drift apart.
type masteryFixture struct {
	KnownStreak int `json:"knownStreak"`
	Cases       []struct {
		Name     string    `json:"name"`
		Baseline *itemStat `json:"baseline"`
		Answers  []struct {
			Correct bool  `json:"correct"`
			At      int64 `json:"at"`
		} `json:"answers"`
		Expected []itemStat `json:"expected"`
	} `json:"cases"`
}

func TestMasteryFixture(t *testing.T) {
	raw, err := os.ReadFile("../testdata/mastery-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx masteryFixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if fx.KnownStreak != knownStreak {
		t.Fatalf("fixture knownStreak = %d, server uses %d", fx.KnownStreak, knownStreak)
	}
	for _, c := range fx.Cases {
		t.Run(c.Name, func(t *testing.T) {
			var s itemStat
			if c.Baseline != nil {
				s = *c.Baseline
			}
			for i, a := range c.Answers {
				s = s.apply(a.Correct, a.At)
				if !reflect.DeepEqual(s, c.Expected[i]) {
					t.Fatalf("after answer %d: got %s, want %s", i+1, show(s), show(c.Expected[i]))
				}
			}
		})
	}
}

func show(s itemStat) string {
	b, _ := json.Marshal(s)
	return string(b)
}
