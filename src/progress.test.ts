import { beforeEach, describe, expect, it } from "vitest";
import {
  correctChoice,
  filledPrompt,
  getCardMark,
  getQuizScore,
  knownCount,
  loadSettings,
  questionsFor,
  saveQuizScore,
  saveSettings,
  setCardMark,
  shuffle,
} from "./progress";
import type { Question } from "./types";

function question(id: string, jlpt: "N5" | "N4" = "N5"): Question {
  return {
    id,
    jlpt,
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

  it("handles empty and single-item arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["a"])).toEqual(["a"]);
  });
});

describe("correctChoice", () => {
  it("returns the choice matching correctId", () => {
    expect(correctChoice(question("q1")).en).toBe("water");
  });

  it("throws when the correct choice is missing", () => {
    const broken = { ...question("q2"), correctId: "zz" };
    expect(() => correctChoice(broken)).toThrow(/q2/);
  });
});

describe("filledPrompt", () => {
  it("substitutes the answer into the blank", () => {
    const q: Question = {
      id: "c1",
      jlpt: "N5",
      kind: "cloze",
      promptJa: [{ ja: "ごはん" }, { ja: "＿", blank: true }, { ja: "食べます" }],
      choices: [{ id: "a", ja: [{ ja: "を" }] }, { id: "b", ja: [{ ja: "に" }] }],
      correctId: "a",
    };
    expect(filledPrompt(q).map((s) => s.ja)).toEqual(["ごはん", "を", "食べます"]);
  });

  it("leaves a prompt without a blank untouched", () => {
    expect(filledPrompt(question("q3")).map((s) => s.ja)).toEqual(["水"]);
  });
});

describe("questionsFor", () => {
  it("filters by level", () => {
    const all = [question("a", "N5"), question("b", "N4"), question("c", "N5")];
    expect(questionsFor("N5", all).map((q) => q.id)).toEqual(["a", "c"]);
    expect(questionsFor("N4", all).map((q) => q.id)).toEqual(["b"]);
  });
});

describe("storage helpers", () => {
  it("round-trips settings and defaults to on", () => {
    expect(loadSettings()).toEqual({ kana: true, hints: true });
    saveSettings({ kana: false, hints: true });
    expect(loadSettings()).toEqual({ kana: false, hints: true });
  });

  it("falls back to defaults on corrupt settings", () => {
    localStorage.setItem("lj.settings", "{not json");
    expect(loadSettings()).toEqual({ kana: true, hints: true });
  });

  it("round-trips quiz scores per category and level", () => {
    expect(getQuizScore("vocabulary", "N5")).toBeUndefined();
    saveQuizScore("vocabulary", "N5", { correct: 3, total: 4, at: 1 });
    expect(getQuizScore("vocabulary", "N5")).toEqual({ correct: 3, total: 4, at: 1 });
    expect(getQuizScore("vocabulary", "N4")).toBeUndefined();
  });

  it("round-trips card marks and counts known cards", () => {
    const pool = [question("a"), question("b"), question("c")];
    setCardMark("a", "known");
    setCardMark("b", "learning");
    expect(getCardMark("a")).toBe("known");
    expect(knownCount(pool)).toBe(1);
  });
});
