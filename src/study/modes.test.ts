import { describe, expect, it } from "vitest";
import { decks } from "../content";
import type { Deck, Question } from "../types";
import { MODES, availableModes, buildQuestions, isMode, type Mode } from "./modes";
import { toPlain } from "./ruby";
import { seeded } from "./rng";

function deckOf(items: [string, string][], questions = 0): Deck {
  return {
    id: "test-deck",
    level: "N5",
    group: "vocab",
    title: "Test",
    titleJa: "テスト",
    order: 1,
    items: items.map(([ja, en], i) => ({ id: `t-${i + 1}`, ja, en })),
    questions: Array.from({ length: questions }, (_, i) => ({
      id: `t-q${i + 1}`,
      prompt: `これ___ほん${i}です。`,
      en: "This is a book.",
      answer: "は",
      distractors: ["を", "に", "で"],
    })),
  };
}

const sample = deckOf([
  ["{水|みず}", "water"],
  ["{本|ほん}", "book"],
  ["{山|やま}", "mountain"],
  ["{川|かわ}", "river"],
  ["ねこ", "cat"],
  ["いぬ", "dog"],
]);

function choiceText(question: Question): string[] {
  return question.choices.map((c) => c.en ?? toPlain(c.ja ?? []));
}

function correctText(question: Question): string {
  const choice = question.choices.find((c) => c.id === question.correctId)!;
  return choice.en ?? toPlain(choice.ja ?? []);
}

describe.each(MODES)("%s mode", (mode) => {
  const questions = buildQuestions(
    mode === "cloze" ? deckOf(sample.items.map((i) => [i.ja, i.en]), 5) : sample,
    mode,
    seeded(1),
  );

  it("gives every question four unique choices", () => {
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      const texts = choiceText(question);
      expect(texts).toHaveLength(4);
      expect(texts).toEqual([...new Set(texts)]);
    }
  });

  it("marks exactly one choice correct and never repeats it as a distractor", () => {
    for (const question of questions) {
      const matches = question.choices.filter((c) => c.id === question.correctId);
      expect(matches).toHaveLength(1);
      const answer = correctText(question);
      const others = choiceText(question).filter((t) => t === answer);
      expect(others).toHaveLength(1);
    }
  });

  it("gives every question a unique id and the deck's level", () => {
    const ids = questions.map((q) => q.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(questions.every((q) => q.jlpt === "N5")).toBe(true);
  });
});

describe("distractor selection", () => {
  it("does not offer a duplicate meaning as a distractor", () => {
    const deck = deckOf([
      ["{早|はや}い", "fast"],
      ["{速|はや}い", "fast"],
      ["{寒|さむ}い", "cold"],
      ["{暑|あつ}い", "hot"],
      ["{安|やす}い", "cheap"],
    ]);
    for (const question of buildQuestions(deck, "meaning", seeded(3))) {
      expect(choiceText(question)).toEqual([...new Set(choiceText(question))]);
    }
  });

  it("does not offer a duplicate kana reading as a distractor", () => {
    const deck = deckOf([
      ["{早|はや}い", "early"],
      ["{速|はや}い", "fast"],
      ["{寒|さむ}い", "cold"],
      ["{暑|あつ}い", "hot"],
      ["{安|やす}い", "cheap"],
    ]);
    for (const question of buildQuestions(deck, "reading", seeded(3))) {
      expect(choiceText(question)).toEqual([...new Set(choiceText(question))]);
    }
  });

  it("drops a question when three distinct distractors cannot be found", () => {
    const deck = deckOf([
      ["{早|はや}い", "fast"],
      ["{速|はや}い", "fast"],
      ["{はやい|はやい}", "fast"],
    ]);
    expect(buildQuestions(deck, "meaning", seeded(3))).toEqual([]);
  });
});

describe("mode specifics", () => {
  it("reading skips kana-only items and hides the furigana", () => {
    const questions = buildQuestions(sample, "reading", seeded(7));
    expect(questions).toHaveLength(4); // 水 本 山 川, not ねこ / いぬ
    for (const question of questions) {
      expect(question.promptJa.every((s) => s.reading === undefined)).toBe(true);
    }
  });

  it("reverse asks in English and answers in Japanese", () => {
    const question = buildQuestions(sample, "reverse", seeded(7))[0]!;
    expect(question.promptEn).toBeTruthy();
    expect(question.promptJa).toEqual([]);
    expect(question.choices.every((c) => c.ja && !c.en)).toBe(true);
  });

  it("cloze uses only the hand-authored questions and keeps one blank", () => {
    const deck = deckOf(sample.items.map((i) => [i.ja, i.en]), 5);
    const questions = buildQuestions(deck, "cloze", seeded(7));
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      expect(question.promptJa.filter((s) => s.blank)).toHaveLength(1);
    }
  });

  it("returns nothing for cloze when a deck has no questions", () => {
    expect(buildQuestions(sample, "cloze", seeded(7))).toEqual([]);
  });
});

describe("determinism", () => {
  it("returns the same questions for the same seed", () => {
    const a = buildQuestions(sample, "meaning", seeded(42));
    const b = buildQuestions(sample, "meaning", seeded(42));
    expect(a).toEqual(b);
  });

  it("returns a different order for a different seed", () => {
    const a = buildQuestions(sample, "meaning", seeded(1)).map((q) => q.id);
    const b = buildQuestions(sample, "meaning", seeded(99)).map((q) => q.id);
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe("availableModes", () => {
  it("leaves out modes that cannot fill four questions", () => {
    const kanaOnly = deckOf([
      ["ねこ", "cat"],
      ["いぬ", "dog"],
      ["とり", "bird"],
      ["うま", "horse"],
      ["さかな", "fish"],
    ]);
    expect(availableModes(kanaOnly)).toEqual(["meaning", "reverse"]);
  });

  it("offers reading once a deck has enough kanji items", () => {
    expect(availableModes(sample)).toEqual(["meaning", "reverse", "reading"]);
  });

  it("offers cloze when a deck has enough questions", () => {
    const deck = deckOf(sample.items.map((i) => [i.ja, i.en]), 4);
    expect(availableModes(deck)).toContain("cloze");
  });
});

describe("every real deck", () => {
  it.each(decks.map((d) => [d.id, d] as const))("%s builds every mode", (_id, deck) => {
    for (const mode of MODES) {
      const questions = buildQuestions(deck, mode, seeded(5));
      for (const question of questions) {
        expect(choiceText(question)).toHaveLength(4);
        expect(question.choices.some((c) => c.id === question.correctId)).toBe(true);
      }
    }
    expect(availableModes(deck).length).toBeGreaterThan(0);
  });

  it("offers meaning and reverse on every deck", () => {
    for (const deck of decks) {
      expect(availableModes(deck), deck.id).toEqual(
        expect.arrayContaining<Mode>(["meaning", "reverse"]),
      );
    }
  });
});

describe("isMode", () => {
  it("guards route params", () => {
    expect(isMode("meaning")).toBe(true);
    expect(isMode("nonsense")).toBe(false);
  });
});
