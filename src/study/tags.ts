import type { Deck, Item, Tag } from "../types";
import { TAGS } from "../types";

/** A word's tags: its deck's, then its own, in `TAGS` order. */
export function tagsOf(deck: Deck, item: Item): Tag[] {
  const own = new Set<Tag>([...(deck.tags ?? []), ...(item.tags ?? [])]);
  return (Object.keys(TAGS) as Tag[]).filter((tag) => own.has(tag));
}
