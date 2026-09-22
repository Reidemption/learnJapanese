import { describe, expect, it } from "vitest";
import type { Deck, Item } from "../types";
import { tagsOf } from "./tags";

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

const item: Item = { id: "d-1", ja: "{駅|えき}", en: "station" };

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
