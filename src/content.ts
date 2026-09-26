import { JLPT_LEVELS, type Deck, type Jlpt } from "./types";

const modules = import.meta.glob<Deck>("../content/decks/*.json", {
  eager: true,
  import: "default",
});

/** Every deck, N5 first, then by the deck's own `order`. */
export const decks: Deck[] = Object.values(modules).sort((a, b) => {
  const level = JLPT_LEVELS.indexOf(a.level) - JLPT_LEVELS.indexOf(b.level);
  if (level !== 0) return level;
  if (a.order !== b.order) return a.order - b.order;
  return a.id.localeCompare(b.id);
});

export function getDeck(id: string): Deck | undefined {
  return decks.find((d) => d.id === id);
}

export function decksFor(level: Jlpt): Deck[] {
  return decks.filter((d) => d.level === level);
}
