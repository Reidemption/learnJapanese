import { describe, expect, it } from "vitest";
import { decks } from "../content";
import type { Deck, Question, RubySegment } from "../types";
import { unitsOf } from "./analytics";
import { availableModes } from "./modes";
import { seeded } from "./rng";
import { hasKanji, toPlain } from "./ruby";
import { levelKanji } from "./script";
import { buildTest, missedDeck, scoreTest, testModes } from "./test";

const kanjiDeck: Deck = {
  id: "kanji",
  level: "N5",
  group: "kanji",
  title: "Kanji",
  titleJa: "漢字",
  order: 1,
  items: [
    { id: "k1", ja: "{水|みず}", en: "water" },
    { id: "k2", ja: "{山|やま}", en: "mountain" },
    { id: "k3", ja: "{川|かわ}", en: "river" },
    { id: "k4", ja: "{本|ほん}", en: "book" },
  ],
};

const vocab: Deck = {
  id: "vocab",
  level: "N5",
  group: "vocab",
  title: "Vocab",
  titleJa: "語彙",
  order: 2,
  items: [
    { id: "v1", ja: "{水|みず}", en: "water" },
    { id: "v2", ja: "{山|やま}{登|のぼ}り", en: "mountain climbing" },
    { id: "v3", ja: "{映画|えいが}", en: "movie" },
    { id: "v4", ja: "ねこ", en: "cat" },
    { id: "v5", ja: "{ごはん||meal}", en: "rice" },
  ],
  questions: [
    { id: "v-q1", prompt: "{水|みず}___のみます。", en: "I drink water.", answer: "を", distractors: ["は", "に", "で"] },
  ],
};

/** Same level and group as `vocab`, so a question it can't fill borrows from here. */
const moreVocab: Deck = {
  ...vocab,
  id: "more-vocab",
  order: 3,
  items: [
    { id: "m1", ja: "{火|ひ}", en: "fire" },
    { id: "m2", ja: "{木|き}", en: "tree" },
    { id: "m3", ja: "{金|かね}", en: "money" },
  ],
  questions: [],
};

const fixture = [kanjiDeck, vocab, moreVocab];

function allSegments(question: Question): RubySegment[] {
  return [...question.promptJa, ...question.choices.flatMap((c) => c.ja ?? [])];
}

describe("buildTest", () => {
  const questions = buildTest(unitsOf(vocab), fixture, seeded(1));

  it("asks every unit in every applicable mode exactly once", () => {
    expect(questions.map((q) => q.id).sort()).toEqual(
      [
        "v1:meaning", "v1:reverse", "v1:reading",
        "v2:meaning", "v2:reverse", "v2:reading",
        "v3:meaning", "v3:reverse",
        "v4:meaning", "v4:reverse",
        "v5:meaning", "v5:reverse",
        "v-q1:cloze",
      ].sort(),
    );
  });

  it("only asks the reading of a word that still shows an in-level kanji", () => {
    const kanji = levelKanji(fixture, "N5");
    expect(testModes(vocab, "v3", kanji)).toEqual(["meaning", "reverse"]); // 映画 → えいが
    expect(testModes(vocab, "v4", kanji)).toEqual(["meaning", "reverse"]);
    for (const q of questions.filter((q) => q.kind === "reading")) {
      expect(hasKanji(toPlain(q.promptJa))).toBe(true);
    }
  });

  it("shows no furigana, no hint glosses and no English line on reading or cloze", () => {
    for (const q of questions) {
      for (const segment of allSegments(q)) {
        expect(segment.reading, q.id).toBeUndefined();
        expect(segment.en, q.id).toBeUndefined();
      }
      if (q.kind === "reading" || q.kind === "cloze") expect(q.promptEn, q.id).toBeUndefined();
    }
    expect(questions.find((q) => q.id === "v2:reading")!.promptJa).toEqual([
      { ja: "山" },
      { ja: "のぼ" },
      { ja: "り" },
    ]);
    const movie = questions.find((q) => q.id === "v3:meaning")!;
    expect(toPlain(movie.promptJa)).toBe("えいが");
  });

  it("borrows distractors from the level's other decks when its own deck is too small", () => {
    // vocab has only three kanji words, so a reading needs a fourth from elsewhere.
    const reading = questions.find((q) => q.id === "v1:reading")!;
    const texts = reading.choices.map((c) => toPlain(c.ja ?? []));
    expect(texts.some((t) => ["ひ", "き", "かね"].includes(t))).toBe(true);
  });

  it("gives the same test for the same seed", () => {
    expect(buildTest(unitsOf(vocab), fixture, seeded(1))).toEqual(questions);
    expect(buildTest(unitsOf(vocab), fixture, seeded(2)).map((q) => q.id)).not.toEqual(
      questions.map((q) => q.id),
    );
  });

  it("builds a full test for every real deck", () => {
    const kanji = levelKanji(decks, "N5");
    for (const deck of decks) {
      const test = buildTest(unitsOf(deck), decks, seeded(3));
      const expected = unitsOf(deck).flatMap((u) => testModes(deck, u.id, kanji));
      expect(test.length, deck.id).toBe(expected.length);
      for (const q of test) expect(q.choices, q.id).toHaveLength(4);
    }
  });
});

describe("scoreTest", () => {
  const questions = buildTest(unitsOf(vocab), fixture, seeded(1));
  const allRight = Object.fromEntries(questions.map((q) => [q.id, q.correctId]));

  it("passes every unit when every answer is right", () => {
    const score = scoreTest(questions, allRight);
    expect(score.units).toHaveLength(6);
    expect(score.units.every((u) => u.passed)).toBe(true);
  });

  it("fails a unit with one wrong answer, and one with one skipped", () => {
    const wrong = questions.find((q) => q.id === "v1:reading")!;
    const wrongId = wrong.choices.find((c) => c.id !== wrong.correctId)!.id;
    const score = scoreTest(questions, { ...allRight, "v1:reading": wrongId, "v4:reverse": null });
    expect(score.units.filter((u) => !u.passed).map((u) => u.unitId).sort()).toEqual(["v1", "v4"]);
    const v1 = score.units.find((u) => u.unitId === "v1")!;
    expect(v1.questions).toHaveLength(3);
    expect(v1.questions.filter((r) => !r.correct).map((r) => r.question.id)).toEqual(["v1:reading"]);
    const skipped = score.questions.find((r) => r.question.id === "v4:reverse")!;
    expect(skipped).toMatchObject({ correct: false, skipped: true });
  });

  it("counts an unanswered question as skipped", () => {
    const score = scoreTest(questions, {});
    expect(score.questions.every((r) => r.skipped && !r.correct)).toBe(true);
  });
});

describe("missedDeck", () => {
  it("practises just the missed words, borrowing distractors from their decks", () => {
    const deck = missedDeck(fixture, ["v1", "v4"], "Missed");
    expect(deck.items.map((i) => i.id)).toEqual(["v1", "v4"]);
    expect(deck.pool?.map((i) => i.id)).toEqual(["v2", "v3", "v5"]);
    expect(availableModes(deck)).toContain("meaning");
  });
});
