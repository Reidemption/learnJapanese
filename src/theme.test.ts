import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isThemeId, resolveTheme } from "./theme";

describe("theme", () => {
  it("recognises only known ids", () => {
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(isThemeId("dark")).toBe(true);
    expect(isThemeId("sepia")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it("follows the system on auto", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });

  it("keeps an explicit choice whatever the system says", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
