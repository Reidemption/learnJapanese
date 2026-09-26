import { describe, expect, it } from "vitest";
import { decks } from "../content";
import type { Deck, Question } from "../types";
import { unitsOf } from "./analytics";
import {
  alsoRight,
  candidateOf,
  glosses,
  isValidKana,
  kanaVariants,
  levelPool,
  rankCandidates,
} from "./distractors";
import { seeded } from "./rng";
import { toPlain } from "./ruby";
import { buildTest } from "./test";

describe("kanaVariants", () => {
  it.each([
    ["きって", ["きて", "きってい", "ぎって", "きっで"]],
    ["おばさん", ["おばあさん", "おはさん", "おぱさん", "おばざん"]],
    ["がっこう", ["がこう", "がっこ", "かっこう", "がっごう"]],
    ["きょう", ["きよう", "きょ", "ぎょう"]],
  ])("gives the near misses of %s", (kana, expected) => {
    expect(kanaVariants(kana)).toEqual(expect.arrayContaining(expected));
  });

  it("puts っ, long vowels and ゃゅょ before dakuten and look-alikes", () => {
    const variants = kanaVariants("きょう");
    expect(variants.indexOf("きよう")).toBeLessThan(variants.indexOf("ぎょう"));
    expect(variants.indexOf("きょ")).toBeLessThan(variants.indexOf("ぎょう"));
  });

  it("never lengthens a vowel that is already long", () => {
    expect(kanaVariants("がっこう")).not.toContain("がっこうう");
    expect(kanaVariants("おおきい")).not.toContain("おおうきい");
  });

  it("handles katakana with ー", () => {
    expect(kanaVariants("コーヒー")).toEqual(expect.arrayContaining(["コヒー", "コーヒ", "ゴーヒー"]));
  });

  it("never returns the input, and only valid kana, for every real reading", () => {
    for (const deck of decks) {
      for (const item of deck.items) {
        const kana = candidateOf(deck, item).kana;
        for (const variant of kanaVariants(kana)) {
          expect(variant, kana).not.toBe(kana);
          expect(isValidKana(variant), `${kana} → ${variant}`).toBe(true);
        }
      }
    }
  });

  it("rejects malformed spellings", () => {
    for (const bad of ["っか", "かっ", "ょう", "かょ", "ーか", "んか", "かっっこ", ""]) {
      expect(isValidKana(bad), bad).toBe(false);
    }
    for (const good of ["きょう", "がっこう", "コーヒー", "しんぶん"]) expect(isValidKana(good), good).toBe(true);
  });
});

const fixture: Deck[] = [
  {
    id: "verbs",
    level: "N5",
    group: "vocab",
    title: "Verbs",
    titleJa: "動詞",
    order: 1,
    tags: ["verb"],
    items: [
      { id: "eat", ja: "{食|た}べる", en: "to eat", tags: ["ru-verb"] },
      { id: "see", ja: "{見|み}る", en: "to see", tags: ["ru-verb"] },
      { id: "drink", ja: "{飲|の}む", en: "to drink", tags: ["u-verb"] },
      { id: "dine", ja: "めしあがる", en: "to eat (honorific)", tags: ["u-verb"] },
    ],
  },
  {
    id: "things",
    level: "N5",
    group: "vocab",
    title: "Things",
    titleJa: "物",
    order: 2,
    tags: ["noun"],
    items: [
      { id: "food", ja: "{食|た}べ{物|もの}", en: "food" },
      { id: "book", ja: "{本|ほん}", en: "book" },
      { id: "water", ja: "{水|みず}", en: "water" },
      { id: "soba1", ja: "そば", en: "buckwheat noodles" },
      { id: "soba2", ja: "そば", en: "near" },
    ],
  },
];

describe("rankCandidates", () => {
  const pool = levelPool(fixture, "N5", "vocab");
  const byId = (id: string) => pool.find((c) => c.item.id === id)!;

  it("ranks a meaning candidate with the same type tags above a different one", () => {
    const ranked = rankCandidates(byId("see"), pool, "meaning", seeded(1)).map((c) => c.item.id);
    expect(ranked.indexOf("eat")).toBeLessThan(ranked.indexOf("book"));
    expect(ranked.indexOf("drink")).toBeLessThan(ranked.indexOf("water"));
  });

  it("ranks a reverse candidate sharing a kanji above an unrelated one", () => {
    const ranked = rankCandidates(byId("food"), pool, "reverse", seeded(1)).map((c) => c.item.id);
    expect(ranked[0]).toBe("eat");
    expect(ranked.indexOf("eat")).toBeLessThan(ranked.indexOf("water"));
  });

  it("never offers a candidate that would also be right", () => {
    expect(alsoRight(byId("eat"), byId("dine"))).toBe(true);
    expect(alsoRight(byId("soba1"), byId("soba2"))).toBe(true);
    const ranked = rankCandidates(byId("eat"), pool, "meaning", seeded(1)).map((c) => c.item.id);
    expect(ranked).not.toContain("eat");
    expect(ranked).not.toContain("dine");
  });

  it("reads the senses out of a gloss", () => {
    expect(glosses("to eat (honorific) / meal; The Bread")).toEqual(["eat", "meal", "bread"]);
  });
});

describe("every test question in every real deck", () => {
  function shown(question: Question): string[] {
    return question.choices.map((c) => c.en ?? toPlain(c.ja ?? []));
  }

  it.each(decks.map((d) => [d.id, d] as const))("%s", { timeout: 30_000 }, (_id, deck) => {
    for (const question of buildTest(unitsOf(deck), decks, seeded(11))) {
      const texts = shown(question);
      expect(texts, question.id).toHaveLength(4);
      expect(new Set(texts).size, `${question.id}: ${texts.join(" | ")}`).toBe(4);
      const correct = question.choices.filter((c) => c.id === question.correctId);
      expect(correct, question.id).toHaveLength(1);
      // No wrong recall choice spells the answer's reading (肩 shown as かた for 方).
      if (question.kind === "reverse") {
        const unit = deck.items.find((i) => `${i.id}:reverse` === question.id)!;
        const wrong = texts.filter((_, i) => question.choices[i]!.id !== question.correctId);
        expect(wrong, question.id).not.toContain(candidateOf(deck, unit).kana);
      }
    }
  });
});
