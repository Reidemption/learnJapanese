import { describe, expect, it } from "vitest";
import { decks, decksFor, getDeck } from "./content";
import { BLANK, isKana, parseRuby } from "./study/ruby";
import { DECK_GROUPS } from "./types";
import type { Deck } from "./types";

const LEVELS = ["N5", "N4"];
const MIN_ITEMS = 10;
const MAX_ITEMS = 30;

/** Every deck, named so a failure points at the file it came from. */
const cases: [string, Deck][] = decks.map((deck) => [deck.id, deck]);

describe("deck collection", () => {
  it("loads decks", () => {
    expect(decks.length).toBeGreaterThanOrEqual(10);
  });

  it("has at least 10 N5 decks", () => {
    expect(decksFor("N5").length).toBeGreaterThanOrEqual(10);
  });

  it("has unique deck ids", () => {
    const ids = decks.map((d) => d.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("has globally unique item and question ids", () => {
    const seen = new Map<string, string>();
    for (const deck of decks) {
      const ids = [
        ...deck.items.map((i) => i.id),
        ...(deck.questions ?? []).map((q) => q.id),
      ];
      for (const id of ids) {
        expect(seen.has(id), `${id} appears in both ${seen.get(id)} and ${deck.id}`).toBe(
          false,
        );
        seen.set(id, deck.id);
      }
    }
  });

  it("sorts N5 before N4, then by order", () => {
    const levels = decks.map((d) => LEVELS.indexOf(d.level));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("finds a deck by id", () => {
    expect(getDeck(decks[0]!.id)).toBe(decks[0]);
    expect(getDeck("nope")).toBeUndefined();
  });
});

describe.each(cases)("deck %s", (id, deck) => {
  it("has the expected shape", () => {
    expect(deck.id, "deck id must match its filename convention").toBe(id);
    expect(LEVELS).toContain(deck.level);
    expect(DECK_GROUPS as readonly string[]).toContain(deck.group);
    expect(deck.title.length).toBeGreaterThan(0);
    expect(deck.titleJa.length).toBeGreaterThan(0);
    expect(Number.isInteger(deck.order)).toBe(true);
  });

  it(`holds ${MIN_ITEMS}–${MAX_ITEMS} items`, () => {
    expect(deck.items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    expect(deck.items.length).toBeLessThanOrEqual(MAX_ITEMS);
  });

  it("has items with parseable markup, kana readings and a meaning", () => {
    for (const item of deck.items) {
      const where = `${deck.id} / ${item.id}`;
      expect(item.en.trim().length, `${where} has no meaning`).toBeGreaterThan(0);
      const segments = parseRuby(item.ja);
      expect(segments.length, `${where} has empty ja`).toBeGreaterThan(0);
      for (const segment of segments) {
        if (!segment.reading) continue;
        expect(isKana(segment.reading), `${where} reading "${segment.reading}" is not kana`).toBe(
          true,
        );
      }
    }
  });

  it("has no placeholder text left in it", () => {
    // Authoring decks in batches makes it easy to leave a stub behind.
    for (const item of deck.items) {
      expect(item.en, `${deck.id} / ${item.id}`).not.toMatch(/placeholder|TODO|FIXME|xxx/i);
      expect(item.ja, `${deck.id} / ${item.id}`).not.toMatch(/[A-Za-z]{3,}\|/);
    }
  });

  it("has no duplicate items within the deck", () => {
    const ja = deck.items.map((i) => i.ja);
    const en = deck.items.map((i) => i.en);
    expect(ja, `${deck.id} repeats a Japanese entry`).toEqual([...new Set(ja)]);
    expect(en, `${deck.id} repeats a meaning`).toEqual([...new Set(en)]);
  });

  it("has well-formed cloze questions", () => {
    for (const question of deck.questions ?? []) {
      const where = `${deck.id} / ${question.id}`;
      const blanks = question.prompt.split(BLANK).length - 1;
      expect(blanks, `${where} needs exactly one ${BLANK}`).toBe(1);
      expect(() => parseRuby(question.prompt), `${where} prompt is malformed`).not.toThrow();
      expect(question.answer.length, `${where} has no answer`).toBeGreaterThan(0);
      expect(question.distractors.length, `${where} needs 3 distractors`).toBe(3);
      expect(
        question.distractors,
        `${where} repeats a distractor or the answer`,
      ).toEqual([...new Set(question.distractors)]);
      expect(
        question.distractors.includes(question.answer),
        `${where} lists its answer as a distractor`,
      ).toBe(false);
      for (const choice of [question.answer, ...question.distractors]) {
        expect(() => parseRuby(choice), `${where} choice "${choice}" is malformed`).not.toThrow();
      }
    }
  });
});
