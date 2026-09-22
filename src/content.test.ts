import { describe, expect, it } from "vitest";
import { decks, decksFor, getDeck } from "./content";
import { BLANK, isKana, parseRuby, toPlain } from "./study/ruby";
import { tagsOf } from "./study/tags";
import { DECK_GROUPS, TAGS, UNTAGGED_GROUPS, VERB_CLASSES } from "./types";
import type { Deck, Tag } from "./types";

const LEVELS = ["N5", "N4"];
const MIN_ITEMS = 10;
const MAX_ITEMS = 30;
/** Enough distinct words for a Custom deck of one tag to build 4-choice questions. */
const MIN_TAG_WORDS = 8;
/** `note` values that name a verb class, and the tag each one needs. */
const NOTE_CLASSES: Record<string, Tag> = {
  "u-verb": "u-verb",
  "ru-verb": "ru-verb",
  irregular: "irregular-verb",
};

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

describe("tags", () => {
  const taggable = decks.filter((d) => !UNTAGGED_GROUPS.includes(d.group));

  /** For each tag: the decks it appears in and its distinct words (plain text). */
  const usage = new Map<Tag, { decks: Set<string>; words: Set<string> }>();
  for (const deck of taggable) {
    for (const item of deck.items) {
      for (const tag of tagsOf(deck, item)) {
        const entry = usage.get(tag) ?? { decks: new Set(), words: new Set() };
        entry.decks.add(deck.id);
        entry.words.add(toPlain(parseRuby(item.ja)));
        usage.set(tag, entry);
      }
    }
  }
  const tagCases = (Object.keys(TAGS) as Tag[]).map((tag) => [tag] as const);

  it.each(tagCases)(`%s has at least ${MIN_TAG_WORDS} distinct words`, (tag) => {
    const words = usage.get(tag)?.words.size ?? 0;
    expect(words, `${tag} tags ${words} words`).toBeGreaterThanOrEqual(MIN_TAG_WORDS);
  });

  // A theme found in one deck is a copy of that deck. Type tags are exempt:
  // they must cover every word, and a kind of word can live in one deck.
  it.each(tagCases.filter(([tag]) => TAGS[tag].facet === "theme"))(
    "theme %s spans at least 2 decks",
    (tag) => {
      const spans = [...(usage.get(tag)?.decks ?? [])];
      expect(spans.length, `${tag} only appears in ${spans.join(", ")}`).toBeGreaterThanOrEqual(2);
    },
  );
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
    for (const question of deck.questions ?? []) {
      const where = `${deck.id} / ${question.id}`;
      expect(question.en ?? "", where).not.toMatch(/placeholder|TODO|FIXME/i);
      // English belongs only in a gloss slot; Latin letters in the Japanese
      // text or reading itself mean a stub was left behind.
      for (const segment of parseRuby(question.prompt)) {
        expect(segment.ja, `${where} has Latin text in its Japanese`).not.toMatch(/[A-Za-z]{3,}/);
        expect(segment.reading ?? "", `${where} has Latin text in a reading`).not.toMatch(/[A-Za-z]/);
        expect(segment.en ?? "", `${where} has a placeholder gloss`).not.toMatch(/placeholder|TODO|FIXME|xxx/i);
      }
    }
  });

  // Hints (hover glosses) help with the words around a cloze blank. Anywhere
  // else they would give the answer away: in meaning mode an item's gloss *is*
  // the answer, and a gloss on a choice labels it.
  it("puts hints on cloze prompts only", () => {
    const glossed = (source: string) => parseRuby(source).some((s) => s.en);
    for (const item of deck.items) {
      expect(glossed(item.ja), `${deck.id} / ${item.id}: items must not carry a hint`).toBe(false);
    }
    for (const question of deck.questions ?? []) {
      const where = `${deck.id} / ${question.id}`;
      for (const choice of [question.answer, ...question.distractors]) {
        expect(glossed(choice), `${where}: choice "${choice}" must not carry a hint`).toBe(false);
      }
      expect(glossed(question.prompt), `${where}: prompt needs at least one hint`).toBe(true);
    }
  });

  it("has no duplicate items within the deck", () => {
    const ja = deck.items.map((i) => i.ja);
    const en = deck.items.map((i) => i.en);
    expect(ja, `${deck.id} repeats a Japanese entry`).toEqual([...new Set(ja)]);
    expect(en, `${deck.id} repeats a meaning`).toEqual([...new Set(en)]);
  });

  it("uses tags correctly", () => {
    const known = Object.keys(TAGS);
    const untagged = UNTAGGED_GROUPS.includes(deck.group);
    for (const tag of deck.tags ?? []) {
      expect(known, `${deck.id} has unknown tag "${tag}"`).toContain(tag);
    }
    if (untagged) expect(deck.tags ?? [], `${deck.group} decks carry no tags`).toEqual([]);
    for (const item of deck.items) {
      const where = `${deck.id} / ${item.id}`;
      const own = item.tags ?? [];
      for (const tag of own) {
        expect(known, `${where} has unknown tag "${tag}"`).toContain(tag);
        expect(deck.tags ?? [], `${where} repeats its deck's tag "${tag}"`).not.toContain(tag);
      }
      expect(own, `${where} repeats a tag`).toEqual([...new Set(own)]);
      if (untagged) {
        expect(own, `${where}: ${deck.group} items carry no tags`).toEqual([]);
        continue;
      }

      const tags = tagsOf(deck, item);
      expect(
        tags.some((tag) => TAGS[tag].facet === "type"),
        `${where} needs a type tag (noun, verb, i-adj, ...)`,
      ).toBe(true);

      const classes = tags.filter((tag) => (VERB_CLASSES as readonly Tag[]).includes(tag));
      if (tags.includes("verb")) {
        expect(classes.length, `${where} is a verb, so it needs exactly one verb class`).toBe(1);
      } else {
        expect(classes, `${where} has a verb class but no verb tag`).toEqual([]);
      }
      const noteClass = item.note ? NOTE_CLASSES[item.note] : undefined;
      if (noteClass && (item.note !== "irregular" || tags.includes("verb"))) {
        expect(classes, `${where} has note "${item.note}"`).toEqual([noteClass]);
      }
    }
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
