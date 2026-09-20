import { describe, expect, it } from "vitest";
import { hasKanji, isKana, parseRuby, toKana, toPlain } from "./ruby";

describe("parseRuby", () => {
  it("passes plain text through as one segment", () => {
    expect(parseRuby("ごはん")).toEqual([{ ja: "ごはん" }]);
  });

  it("reads {base|reading}", () => {
    expect(parseRuby("{水|みず}")).toEqual([{ ja: "水", reading: "みず" }]);
  });

  it("reads {base|reading|gloss}", () => {
    expect(parseRuby("{毎日|まいにち|every day}")).toEqual([
      { ja: "毎日", reading: "まいにち", en: "every day" },
    ]);
  });

  it("reads a gloss with no reading", () => {
    expect(parseRuby("{ごはん||meal}")).toEqual([{ ja: "ごはん", en: "meal" }]);
  });

  it("splits mixed strings and keeps order", () => {
    expect(parseRuby("お{父|とう}さん")).toEqual([
      { ja: "お" },
      { ja: "父", reading: "とう" },
      { ja: "さん" },
    ]);
  });

  it("turns ___ into a blank segment", () => {
    expect(parseRuby("ごはん___{食|た}べます。")).toEqual([
      { ja: "ごはん" },
      { ja: "＿", blank: true },
      { ja: "食", reading: "た" },
      { ja: "べます。" },
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseRuby("")).toEqual([]);
  });

  it.each([
    ["unclosed brace", "{水|みず"],
    ["stray closing brace", "水}みず"],
    ["missing reading field", "{水}"],
    ["too many fields", "{水|みず|water|extra}"],
    ["empty base", "{|みず}"],
    ["empty reading and gloss", "{水||}"],
  ])("throws on %s", (_label, source) => {
    expect(() => parseRuby(source)).toThrow();
  });
});

describe("toKana / toPlain", () => {
  it("uses readings where present and drops blanks", () => {
    const segments = parseRuby("お{茶|ちゃ}を___");
    expect(toKana(segments)).toBe("おちゃを");
    expect(toPlain(segments)).toBe("お茶を＿");
  });
});

describe("isKana / hasKanji", () => {
  it("recognises kana-only strings", () => {
    expect(isKana("みず")).toBe(true);
    expect(isKana("コーヒー")).toBe(true);
    expect(isKana("水")).toBe(false);
    expect(isKana("water")).toBe(false);
  });

  it("finds kanji", () => {
    expect(hasKanji("お茶")).toBe(true);
    expect(hasKanji("ごはん")).toBe(false);
  });
});
