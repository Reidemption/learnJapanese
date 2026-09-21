/**
 * The typefaces offered for Japanese study text. The stacks are applied as the
 * `--ja` CSS variable; every family here is loaded from Google Fonts in
 * `index.html`, and the browser only downloads the one actually in use.
 */
export const FONTS = [
  {
    id: "mincho",
    label: "Mincho",
    stack: '"Shippori Mincho", "Hiragino Mincho ProN", serif',
  },
  {
    id: "gothic",
    label: "Gothic",
    stack: '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif',
  },
  {
    id: "rounded",
    label: "Rounded",
    stack: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif',
  },
  {
    id: "handwritten",
    label: "Handwritten",
    stack: '"Klee One", "YuKyokasho", serif',
  },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export const DEFAULT_FONT: FontId = "mincho";

export function isFontId(value: unknown): value is FontId {
  return FONTS.some((f) => f.id === value);
}

export function fontStack(id: FontId): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;
}
