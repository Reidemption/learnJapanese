import { beforeEach, describe, expect, it } from "vitest";
import {
  correctChoice,
  deckBest,
  filledPrompt,
  ATTEMPT_LOG_CAP,
  getItemStats,
  getScore,
  importAttempts,
  itemIdOf,
  loadAttemptLog,
  loadSettings,
  mergeScore,
  recordAttempt,
  saveScore,
  type LoggedAttempt,
  saveSettings,
  shuffle,
} from "./progress";
import type { Question } from "./types";

function question(id: string): Question {
  return {
    id,
    jlpt: "N5",
    kind: "meaning",
    promptJa: [{ ja: "水", reading: "みず" }],
    choices: [
      { id: "a", en: "water" },
      { id: "b", en: "fire" },
    ],
    correctId: "a",
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("shuffle", () => {
  it("keeps every item and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(out).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("correctChoice", () => {
  it("returns the choice matching correctId", () => {
    expect(correctChoice(question("q1")).en).toBe("water");
  });

  it("throws when the correct choice is missing", () => {
    expect(() => correctChoice({ ...question("q2"), correctId: "zz" })).toThrow(/q2/);
  });
});

describe("filledPrompt", () => {
  it("substitutes the answer into the blank", () => {
    const q: Question = {
      id: "c1",
      jlpt: "N5",
      kind: "cloze",
      promptJa: [{ ja: "ごはん" }, { ja: "＿", blank: true }, { ja: "食べます" }],
      choices: [
        { id: "a", ja: [{ ja: "を" }] },
        { id: "b", ja: [{ ja: "に" }] },
      ],
      correctId: "a",
    };
    expect(filledPrompt(q).map((s) => s.ja)).toEqual(["ごはん", "を", "食べます"]);
  });

  it("leaves a prompt without a blank untouched", () => {
    expect(filledPrompt(question("q3")).map((s) => s.ja)).toEqual(["水"]);
  });
});

describe("itemIdOf", () => {
  it("strips the mode suffix", () => {
    expect(itemIdOf(question("n5-food-3:meaning"))).toBe("n5-food-3");
    expect(itemIdOf(question("bare-id"))).toBe("bare-id");
  });
});

describe("settings", () => {
  it("round-trips and defaults to on, in the Mincho font", () => {
    expect(loadSettings()).toEqual({ kana: true, hints: true, font: "mincho" });
    saveSettings({ kana: false, hints: true, font: "rounded" });
    expect(loadSettings()).toEqual({ kana: false, hints: true, font: "rounded" });
  });

  it("falls back to defaults on corrupt storage", () => {
    localStorage.setItem("lj.settings", "{not json");
    expect(loadSettings()).toEqual({ kana: true, hints: true, font: "mincho" });
  });

  it("keeps settings saved before the font picker existed", () => {
    localStorage.setItem("lj.settings", JSON.stringify({ kana: false, hints: false }));
    expect(loadSettings()).toEqual({ kana: false, hints: false, font: "mincho" });
  });

  it("ignores an unknown font", () => {
    localStorage.setItem("lj.settings", JSON.stringify({ kana: true, hints: true, font: "comic" }));
    expect(loadSettings().font).toBe("mincho");
  });
});

describe("scores", () => {
  it("round-trips per deck and mode", () => {
    expect(getScore("n5-food", "meaning")).toBeUndefined();
    saveScore("n5-food", "meaning", { correct: 3, total: 4 });
    expect(getScore("n5-food", "meaning")).toMatchObject({ best: 3, last: 3, total: 4 });
    expect(getScore("n5-food", "reading")).toBeUndefined();
  });

  it("keeps the best run but tracks the latest", () => {
    saveScore("n5-food", "meaning", { correct: 9, total: 10 });
    saveScore("n5-food", "meaning", { correct: 4, total: 10 });
    expect(getScore("n5-food", "meaning")).toMatchObject({ best: 9, last: 4 });
  });

  it("reports the best ratio across a deck's modes", () => {
    expect(deckBest("n5-food")).toBeUndefined();
    saveScore("n5-food", "meaning", { correct: 5, total: 10 });
    saveScore("n5-food", "reading", { correct: 8, total: 10 });
    saveScore("n5-places", "meaning", { correct: 10, total: 10 });
    expect(deckBest("n5-food")).toBeCloseTo(0.8);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("lj.scores", "]]not json[[");
    expect(getScore("n5-food", "meaning")).toBeUndefined();
    expect(() => saveScore("n5-food", "meaning", { correct: 1, total: 2 })).not.toThrow();
    expect(getScore("n5-food", "meaning")).toMatchObject({ best: 1 });
  });
});

describe("mergeScore", () => {
  it("never lets an older run replace the latest one", () => {
    const latest = { best: 5, last: 5, total: 10, at: 200 };
    expect(mergeScore(latest, { correct: 9, total: 10, at: 100 })).toEqual({
      best: 9,
      last: 5,
      total: 10,
      at: 200,
    });
    expect(mergeScore(latest, { correct: 2, total: 8, at: 300 })).toEqual({
      best: 5,
      last: 2,
      total: 8,
      at: 300,
    });
  });
});

let nextUid = 0;
function session(at: number, items: [string, boolean][]): LoggedAttempt {
  nextUid += 1;
  return {
    uid: `s${nextUid}`,
    deckId: "n5-food",
    mode: "meaning",
    correct: items.filter(([, ok]) => ok).length,
    total: items.length,
    kana: false,
    hints: false,
    at,
    items: items.map(([itemId, correct]) => ({ itemId, mode: "meaning", correct })),
  };
}

describe("item stats and the session log", () => {
  it("accumulates counts and streaks per unit", () => {
    recordAttempt(session(1, [["a", true], ["b", false]]));
    recordAttempt(session(2, [["a", true], ["b", false]]));
    recordAttempt(session(3, [["a", true], ["b", true]]));
    expect(getItemStats()).toEqual({
      a: { seen: 3, correct: 3, streak: 3, firstAt: 1, lastAt: 3, knownAt: 3 },
      b: { seen: 3, correct: 1, streak: 1, firstAt: 1, lastAt: 3, knownAt: null },
    });
  });

  it("keeps totals recorded before the log existed", () => {
    localStorage.setItem("lj.items", JSON.stringify({ a: { seen: 5, correct: 2 } }));
    expect(getItemStats().a).toMatchObject({ seen: 5, correct: 2, streak: 0, knownAt: null });
    recordAttempt(session(10, [["a", true]]));
    expect(getItemStats().a).toMatchObject({ seen: 6, correct: 3, streak: 1, firstAt: 10 });
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("lj.items", "nope");
    localStorage.setItem("lj.attempts", "{also nope");
    expect(getItemStats()).toEqual({});
    expect(loadAttemptLog()).toEqual([]);
    recordAttempt(session(1, [["a", true]]));
    expect(getItemStats().a).toMatchObject({ seen: 1, correct: 1 });
  });

  it("drops malformed log entries instead of crashing", () => {
    localStorage.setItem("lj.attempts", JSON.stringify([{ uid: 3 }, session(1, [["a", true]])]));
    expect(loadAttemptLog()).toHaveLength(1);
  });

  it("caps the log, folding the oldest sessions into the baseline", () => {
    const cap = 5;
    for (let i = 0; i < cap + 10; i += 1) recordAttempt(session(i, [["a", i % 4 !== 0]]), cap);
    const log = loadAttemptLog();
    expect(log).toHaveLength(cap);
    expect(log[0]?.at).toBe(10);
    // Every answer still counts, including the folded ones.
    expect(getItemStats().a).toMatchObject({ seen: 15, correct: 11, firstAt: 0, lastAt: 14 });
  });

  it("holds the real cap when a backup brings in more sessions", () => {
    const many = Array.from({ length: ATTEMPT_LOG_CAP + 10 }, (_, i) => session(i, [["a", true]]));
    expect(importAttempts(many, {}, () => true).imported).toBe(ATTEMPT_LOG_CAP + 10);
    expect(loadAttemptLog()).toHaveLength(ATTEMPT_LOG_CAP);
    expect(getItemStats().a?.seen).toBe(ATTEMPT_LOG_CAP + 10);
  });

  it("replays imported sessions in time order", () => {
    recordAttempt(session(30, [["a", true]]));
    importAttempts([session(10, [["a", true]]), session(20, [["a", false]])], {}, () => true);
    expect(getItemStats().a).toMatchObject({ seen: 3, correct: 2, streak: 1, firstAt: 10 });
  });
});
