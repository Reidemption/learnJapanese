import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import { DEFAULT_FONT, FONTS, fontStack, isFontId } from "./fonts";

describe("fonts", () => {
  it("has unique ids and includes the default", () => {
    const ids = FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(isFontId(DEFAULT_FONT)).toBe(true);
  });

  it("recognises only known ids", () => {
    expect(isFontId("gothic")).toBe(true);
    expect(isFontId("comic")).toBe(false);
    expect(isFontId(undefined)).toBe(false);
  });

  it("maps an id to its stack", () => {
    expect(fontStack("rounded")).toContain("Zen Maru Gothic");
  });

  // Offering a font that index.html never loads would silently fall back to a
  // system face, so every stack's first family must be in the Google Fonts URL.
  it("loads every offered font in index.html", () => {
    for (const font of FONTS) {
      const family = font.stack.match(/^"([^"]+)"/)?.[1];
      expect(family, font.id).toBeDefined();
      expect(html, `${font.id} (${family})`).toContain(`family=${family!.replace(/ /g, "+")}:`);
    }
  });
});
