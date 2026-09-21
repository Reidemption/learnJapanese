import { beforeEach, describe, expect, it } from "vitest";
import {
  correctChoice,
  deckBest,
  filledPrompt,
  getItemStats,
  getScore,
  itemIdOf,
  loadSettings,
  recordItems,
  saveScore,
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

describe("item stats", () => {
  it("accumulates seen and correct counts", () => {
    recordItems([
      { itemId: "a", correct: true },
      { itemId: "b", correct: false },
    ]);
    recordItems([
      { itemId: "a", correct: false },
      { itemId: "b", correct: false },
    ]);
    expect(getItemStats()).toEqual({
      a: { seen: 2, correct: 1 },
      b: { seen: 2, correct: 0 },
    });
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("lj.items", "nope");
    expect(getItemStats()).toEqual({});
    recordItems([{ itemId: "a", correct: true }]);
    expect(getItemStats()).toEqual({ a: { seen: 1, correct: 1 } });
  });
});
