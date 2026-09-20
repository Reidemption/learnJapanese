import { describe, expect, it } from "vitest";
import { decksFor } from "./content";
import { availableModes } from "./study/modes";
import type { Deck } from "./types";

/**
 * Guards N5 coverage (docs/PLAN.md, Phase 3.5). These are floors, not targets:
 * they exist so content cannot silently shrink back below "exam ready".
 */
const MIN_VOCAB_ITEMS = 700;
const MIN_KANJI = 100;
const MIN_GRAMMAR_POINTS = 75;

const VOCAB_GROUPS = ["vocab", "phrases", "verbs", "numbers"];
const KANJI = /[一-龯]/gu;

const n5 = decksFor("N5");

function itemsIn(groups: string[]): Deck[] {
  return n5.filter((deck) => groups.includes(deck.group));
}

describe("N5 coverage", () => {
  it(`has at least ${MIN_VOCAB_ITEMS} distinct vocabulary items`, () => {
    const words = new Set(itemsIn(VOCAB_GROUPS).flatMap((d) => d.items.map((i) => i.ja)));
    expect(words.size).toBeGreaterThanOrEqual(MIN_VOCAB_ITEMS);
  });

  it(`covers at least ${MIN_KANJI} distinct kanji`, () => {
    const chars = new Set(
      itemsIn(["kanji"]).flatMap((d) => d.items.flatMap((i) => i.ja.match(KANJI) ?? [])),
    );
    expect(chars.size).toBeGreaterThanOrEqual(MIN_KANJI);
  });

  it(`covers at least ${MIN_GRAMMAR_POINTS} grammar points`, () => {
    const points = new Set(
      itemsIn(["grammar", "particles"]).flatMap((d) => d.items.map((i) => i.ja)),
    );
    expect(points.size).toBeGreaterThanOrEqual(MIN_GRAMMAR_POINTS);
  });

  it("drills every grammar deck with cloze questions", () => {
    for (const deck of itemsIn(["grammar", "particles"])) {
      expect(availableModes(deck), deck.id).toContain("cloze");
    }
  });

  it("offers meaning and reverse on every N5 deck, and reading on the kanji decks", () => {
    for (const deck of n5) {
      const modes = availableModes(deck);
      expect(modes, deck.id).toContain("meaning");
      expect(modes, deck.id).toContain("reverse");
      if (deck.group === "kanji") expect(modes, deck.id).toContain("reading");
    }
  });
});
