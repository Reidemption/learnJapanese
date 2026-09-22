/**
 * The colour theme. "auto" follows the system's light/dark preference; the
 * resolved theme is applied as `data-theme` on <html>, and `style.css`
 * redefines its colour tokens under `[data-theme="dark"]`.
 */
export const THEMES = [
  { id: "auto", label: "Auto theme" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "auto";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function resolveTheme(theme: ThemeId, systemDark: boolean): "light" | "dark" {
  if (theme === "auto") return systemDark ? "dark" : "light";
  return theme;
}
