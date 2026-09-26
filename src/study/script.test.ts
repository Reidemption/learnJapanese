import { describe, expect, it } from "vitest";
import { decks } from "../content";
import type { Deck } from "../types";
import { parseRuby } from "./ruby";
import { levelKanji, levelScript } from "./script";

describe("levelKanji", () => {
  const n5 = levelKanji(decks, "N5");

  it("takes the N5 kanji from the kanji decks", () => {
    for (const kanji of ["日", "水", "食"]) expect(n5.has(kanji), kanji).toBe(true);
  });

  it("leaves out kanji no N5 kanji deck teaches", () => {
    expect(n5.has("曜")).toBe(false);
    expect(n5.has("映")).toBe(false);
  });

  it("includes the easier levels' kanji in a harder level", () => {
    const n4Deck: Deck = {
      id: "n4-kanji-test",
      level: "N4",
      group: "kanji",
      title: "N4 kanji",
      titleJa: "漢字",
      order: 1,
      items: [{ id: "n4-k-1", ja: "{映|えい}", en: "reflect" }],
    };
    const n4 = levelKanji([...decks, n4Deck], "N4");
    expect(n4.has("映")).toBe(true);
    expect(n4.has("水")).toBe(true);
    expect(levelKanji([...decks, n4Deck], "N5").has("映")).toBe(false);
  });
});

describe("levelScript", () => {
  const kanji = new Set(["水", "日", "本"]);

  it("keeps segments whose kanji are all in the set, without furigana", () => {
    expect(levelScript(parseRuby("{日本|にほん}"), kanji)).toEqual([{ ja: "日本" }]);
  });

  it("writes a segment with a kanji above the level in its reading", () => {
    expect(levelScript(parseRuby("{水曜日|すいようび}"), kanji)).toEqual([{ ja: "すいようび" }]);
    expect(levelScript(parseRuby("{映画|えいが}を{見|み}る"), kanji)).toEqual([
      { ja: "えいが" },
      { ja: "を" },
      { ja: "み" },
      { ja: "る" },
    ]);
  });

  it("leaves plain kana alone and drops hint glosses", () => {
    expect(levelScript(parseRuby("{ごはん||meal}です"), kanji)).toEqual([
      { ja: "ごはん" },
      { ja: "です" },
    ]);
  });

  it("keeps a cloze blank", () => {
    const out = levelScript(parseRuby("{水|みず}___のむ"), kanji);
    expect(out[1]).toEqual({ ja: "＿", blank: true });
  });
});
