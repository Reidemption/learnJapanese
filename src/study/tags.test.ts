import { describe, expect, it } from "vitest";
import { decks as realDecks } from "../content";
import type { Deck, Item } from "../types";
import { emptyStat, type ItemStat } from "./mastery";
import { availableModes, buildQuestions } from "./modes";
import { seeded } from "./rng";
import {
  CUSTOM_DECK_ID,
  buildCustomDeck,
  customDeckFrom,
  customTitle,
  matchingUnits,
  pickUnits,
  tagsOf,
  type UnitOrder,
} from "./tags";

function deck(partial: Partial<Deck>): Deck {
  return {
    id: "d",
    level: "N5",
    group: "vocab",
    title: "D",
    titleJa: "D",
    order: 1,
    items: [],
    ...partial,
  };
}

function stat(partial: Partial<ItemStat>): ItemStat {
  return { ...emptyStat(), ...partial };
}

const item: Item = { id: "d-1", ja: "{駅|えき}", en: "station" };

const verbs = deck({
  id: "verbs",
  group: "verbs",
  tags: ["verb"],
  items: [
    { id: "v1", ja: "{食|た}べる", en: "to eat", tags: ["ru-verb", "food"] },
    { id: "v2", ja: "{行|い}く", en: "to go", tags: ["u-verb"] },
    { id: "v3", ja: "する", en: "to do", tags: ["irregular-verb"] },
  ],
});
const food = deck({
  id: "food",
  tags: ["noun", "food"],
  items: [
    { id: "f1", ja: "{肉|にく}", en: "meat" },
    { id: "f2", ja: "そば", en: "buckwheat noodles" },
  ],
});
const places = deck({
  id: "places",
  tags: ["noun"],
  items: [
    { id: "p1", ja: "そば", en: "close by" },
    { id: "p2", ja: "{駅|えき}", en: "train station", tags: ["place"] },
    { id: "p3", ja: "とても", en: "very", tags: ["adverb"] },
  ],
});
const kanji = deck({ id: "kanji", group: "kanji", items: [{ id: "k1", ja: "{山|やま}", en: "mountain" }] });
const n4 = deck({ id: "n4", level: "N4", tags: ["noun", "food"], items: [{ id: "n4-1", ja: "{米|こめ}", en: "rice" }] });
const fixture = [verbs, food, places, kanji, n4];

const ids = (units: { id: string }[]) => units.map((u) => u.id);

describe("tagsOf", () => {
  it("combines the deck's tags with the item's, in TAGS order", () => {
    const d = deck({ tags: ["place", "noun"] });
    expect(tagsOf(d, { ...item, tags: ["transport"] })).toEqual(["noun", "place", "transport"]);
  });

  it("works when either side has none", () => {
    expect(tagsOf(deck({}), item)).toEqual([]);
    expect(tagsOf(deck({ tags: ["noun"] }), item)).toEqual(["noun"]);
    expect(tagsOf(deck({}), { ...item, tags: ["noun"] })).toEqual(["noun"]);
  });
});

describe("matchingUnits", () => {
  it("widens within a facet and narrows across facets", () => {
    expect(ids(matchingUnits(fixture, "N5", ["verb"]))).toEqual(["v1", "v2", "v3"]);
    expect(ids(matchingUnits(fixture, "N5", ["verb", "adverb"]))).toEqual(["v1", "v2", "v3", "p3"]);
    expect(ids(matchingUnits(fixture, "N5", ["verb", "food"]))).toEqual(["v1"]);
    expect(ids(matchingUnits(fixture, "N5", ["noun", "verb", "food"]))).toEqual(["v1", "f1", "f2"]);
  });

  it("keeps to the level, and matches nothing with nothing selected", () => {
    expect(ids(matchingUnits(fixture, "N4", ["food"]))).toEqual(["n4-1"]);
    expect(matchingUnits(fixture, "N5", [])).toEqual([]);
  });

  it("carries each word's deck", () => {
    expect(matchingUnits(fixture, "N5", ["place"])).toEqual([
      { id: "p2", deckId: "places", ja: "{駅|えき}", en: "train station" },
    ]);
  });
});

describe("pickUnits", () => {
  const nouns = matchingUnits(fixture, "N5", ["noun"]);

  it("never takes two words with the same Japanese or the same meaning", () => {
    const sameJa = pickUnits(nouns, {}, seeded(1));
    expect(sameJa.filter((u) => u.ja === "そば")).toHaveLength(1);

    const clash = [
      { id: "a", deckId: "x", ja: "{万|まん}", en: "ten thousand" },
      { id: "b", deckId: "y", ja: "{一万|いちまん}", en: "ten thousand" },
      { id: "c", deckId: "y", ja: "{千|せん}", en: "thousand" },
    ];
    for (let seed = 1; seed <= 5; seed++) {
      const picked = ids(pickUnits(clash, {}, seeded(seed)));
      expect(picked).toHaveLength(2);
      expect(picked).toContain("c");
    }
  });

  it("puts weak words first, then learning, then new, then known", () => {
    const units = ["known", "new", "learning", "weak"].map((id) => ({ id, deckId: "d", ja: id, en: id }));
    const stats = {
      known: stat({ seen: 3, correct: 3, streak: 3, lastAt: 1 }),
      learning: stat({ seen: 1, correct: 1, streak: 1, lastAt: 5 }),
      weak: stat({ seen: 4, correct: 1, lastAt: 9 }),
    };
    expect(ids(pickUnits(units, stats, seeded(1)))).toEqual(["weak", "learning", "new", "known"]);
    expect(ids(pickUnits(units, stats, seeded(1), { size: 2 }))).toEqual(["weak", "learning"]);
  });

  it("orders within a tier by least recently seen, and weak by accuracy", () => {
    const units = ["recent", "old", "weaker", "weakish"].map((id) => ({ id, deckId: "d", ja: id, en: id }));
    const stats = {
      recent: stat({ seen: 1, correct: 1, streak: 1, lastAt: 50 }),
      old: stat({ seen: 1, correct: 1, streak: 1, lastAt: 10 }),
      weaker: stat({ seen: 5, correct: 1, lastAt: 1 }),
      weakish: stat({ seen: 5, correct: 2, lastAt: 1 }),
    };
    expect(ids(pickUnits(units, stats, seeded(3)))).toEqual(["weaker", "weakish", "old", "recent"]);
  });

  it("takes a caller's order instead", () => {
    const units = ["a", "b", "c"].map((id) => ({ id, deckId: "d", ja: id, en: id }));
    const reverse: UnitOrder = (x, y) => y.index - x.index;
    expect(ids(pickUnits(units, {}, seeded(1), { order: reverse }))).toEqual(["c", "b", "a"]);
  });

  it("caps at the size, and gives everything when there is less", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, deckId: "d", ja: `w${i}`, en: `w${i}` }));
    expect(pickUnits(many, {}, seeded(1))).toHaveLength(20);
    expect(pickUnits(many.slice(0, 7), {}, seeded(1))).toHaveLength(7);
  });

  it("picks differently with another seed, and avoids the last pick when it can", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, deckId: "d", ja: `w${i}`, en: `w${i}` }));
    const first = ids(pickUnits(many, {}, seeded(1), { size: 10 }));
    expect(ids(pickUnits(many, {}, seeded(2), { size: 10 }))).not.toEqual(first);

    const next = ids(pickUnits(many, {}, seeded(2), { size: 10, avoid: new Set(first) }));
    expect(next.filter((id) => first.includes(id))).toEqual([]);
    const wrap = ids(pickUnits(many, {}, seeded(3), { size: 25, avoid: new Set(first) }));
    expect(wrap).toHaveLength(25);
  });
});

describe("customDeckFrom", () => {
  const grammar = deck({
    id: "grammar",
    group: "grammar",
    items: [{ id: "g1", ja: "です", en: "is" }],
    questions: [
      { id: "q1", prompt: "{本|ほん}___です。", answer: "は", distractors: ["が", "を", "に"] },
    ],
  });

  it("holds exactly the given items and cloze questions, from any decks", () => {
    const built = customDeckFrom([...fixture, grammar], ["v2", "q1", "f1", "missing"], "Mixed");
    expect(built.id).toBe(CUSTOM_DECK_ID);
    expect(built.title).toBe("Mixed");
    expect(ids(built.items)).toEqual(["v2", "f1"]);
    expect(ids(built.questions ?? [])).toEqual(["q1"]);
    expect(built.group).toBe("vocab");
  });

  it("takes the level from its words, and the group when they share one", () => {
    expect(customDeckFrom(fixture, ["n4-1"], "x").level).toBe("N4");
    expect(customDeckFrom(fixture, ["v1", "v2"], "x").group).toBe("verbs");
  });

  it("drops a word that collides with an earlier one", () => {
    expect(ids(customDeckFrom(fixture, ["f2", "p1", "p2"], "x").items)).toEqual(["f2", "p2"]);
  });
});

describe("buildCustomDeck", () => {
  it("titles the deck from the tags", () => {
    expect(customTitle(["time", "verb"])).toBe("Verbs · Time");
    expect(buildCustomDeck(fixture, {}, "N5", ["verb"], seeded(1)).title).toBe("Verbs");
  });

  it("builds a playable 20-word deck from real content", () => {
    const built = buildCustomDeck(realDecks, {}, "N5", ["verb"], seeded(7));
    expect(built.items).toHaveLength(20);
    expect(availableModes(built)).toEqual(["meaning", "reverse", "reading"]);
    for (const mode of availableModes(built)) {
      for (const question of buildQuestions(built, mode, seeded(1))) {
        const texts = question.choices.map((c) => c.en ?? JSON.stringify(c.ja));
        expect(new Set(texts).size, `${question.id} repeats a choice`).toBe(4);
      }
    }
  });
});
