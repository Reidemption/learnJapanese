import type { Deck, DeckGroup, Item, Jlpt, Tag } from "../types";
import { TAGS, UNTAGGED_GROUPS } from "../types";
import type { Unit } from "./analytics";
import { isWeak, masteryOf, type ItemStat } from "./mastery";
import type { Rng } from "./rng";
import { parseRuby, toPlain } from "./ruby";

/** How many words a Custom deck holds: a normal deck's size. */
export const CUSTOM_SIZE = 20;

/** Every Custom deck has this id; results are recorded with an empty deckId. */
export const CUSTOM_DECK_ID = "custom";

type Stats = Record<string, ItemStat>;

/** A word's tags: its deck's, then its own, in `TAGS` order. */
export function tagsOf(deck: Deck, item: Item): Tag[] {
  const own = new Set<Tag>([...(deck.tags ?? []), ...(item.tags ?? [])]);
  return (Object.keys(TAGS) as Tag[]).filter((tag) => own.has(tag));
}

function unitOf(deck: Deck, item: Item): Unit {
  return { id: item.id, deckId: deck.id, ja: item.ja, en: item.en };
}

/**
 * The level's words that match `selected`. Tags in the same facet widen the
 * set (verb OR adverb); tags in different facets narrow it (verb AND time).
 * Nothing selected matches nothing. Words come in course order.
 */
export function matchingUnits(decks: Deck[], level: Jlpt, selected: Tag[]): Unit[] {
  if (!selected.length) return [];
  const facets = new Map<string, Tag[]>();
  for (const tag of selected) {
    const facet = TAGS[tag].facet;
    facets.set(facet, [...(facets.get(facet) ?? []), tag]);
  }
  const out: Unit[] = [];
  for (const deck of decks) {
    if (deck.level !== level || UNTAGGED_GROUPS.includes(deck.group)) continue;
    for (const item of deck.items) {
      const tags = tagsOf(deck, item);
      const matches = [...facets.values()].every((group) => group.some((tag) => tags.includes(tag)));
      if (matches) out.push(unitOf(deck, item));
    }
  }
  return out;
}

/**
 * Words that would make a question with two right answers if they met in one
 * deck: the same Japanese (そば, "close by" and "buckwheat noodles") or the
 * same meaning (万 and 一万, "ten thousand"). Each deck avoids this on its
 * own; a deck built across decks has to check.
 */
function collisionKeys(unit: Unit): string[] {
  return [`ja:${toPlain(parseRuby(unit.ja))}`, `en:${unit.en}`];
}

/** One candidate as an order sees it. `tie` is a random number per pick. */
export type Ranked = { unit: Unit; stat: ItemStat | undefined; index: number; tie: number };
export type UnitOrder = (a: Ranked, b: Ranked) => number;

function tier(stat: ItemStat | undefined): number {
  if (isWeak(stat)) return 0;
  const mastery = masteryOf(stat);
  return mastery === "learning" ? 1 : mastery === "new" ? 2 : 3;
}

/**
 * The words that need work first: weak (lowest accuracy first), then learning
 * and then known (least recently seen first), with new words in between.
 * New words come in a random order, so "New set" varies even on day one.
 */
export const needsWork: UnitOrder = (a, b) => {
  const byTier = tier(a.stat) - tier(b.stat);
  if (byTier !== 0) return byTier;
  if (a.stat && b.stat) {
    if (isWeak(a.stat)) {
      const accuracy = a.stat.correct / a.stat.seen - b.stat.correct / b.stat.seen;
      if (accuracy !== 0) return accuracy;
    }
    const seen = (a.stat.lastAt ?? 0) - (b.stat.lastAt ?? 0);
    if (seen !== 0) return seen;
  }
  return a.tie - b.tie;
};

export type PickOptions = {
  size?: number;
  order?: UnitOrder;
  /** Words to take only when nothing else is left, e.g. the last pick. */
  avoid?: ReadonlySet<string>;
};

/**
 * Up to `size` of `candidates`, in `order`, never taking two words that
 * collide. `rng` breaks ties, so another seed can give another pick.
 */
export function pickUnits(
  candidates: Unit[],
  stats: Stats,
  rng: Rng,
  { size = CUSTOM_SIZE, order = needsWork, avoid }: PickOptions = {},
): Unit[] {
  const ranked = candidates
    .map((unit, index) => ({ unit, stat: stats[unit.id], index, tie: rng() }))
    .sort((a, b) => {
      const avoided = Number(avoid?.has(a.unit.id) ?? false) - Number(avoid?.has(b.unit.id) ?? false);
      return avoided || order(a, b) || a.index - b.index;
    });
  const taken = new Set<string>();
  const picked: Unit[] = [];
  for (const { unit } of ranked) {
    if (picked.length === size) break;
    const keys = collisionKeys(unit);
    if (keys.some((key) => taken.has(key))) continue;
    keys.forEach((key) => taken.add(key));
    picked.push(unit);
  }
  return picked;
}

/**
 * An ordinary deck holding exactly these units, in this order: items as
 * items, cloze questions as questions. The study modes then work on it
 * unchanged. Units that collide with an earlier one are dropped.
 */
export function customDeckFrom(decks: Deck[], unitIds: string[], title: string): Deck {
  const items = new Map<string, { deck: Deck; item: Item }>();
  const questions = new Map<string, { deck: Deck; question: NonNullable<Deck["questions"]>[number] }>();
  for (const deck of decks) {
    for (const item of deck.items) items.set(item.id, { deck, item });
    for (const question of deck.questions ?? []) questions.set(question.id, { deck, question });
  }

  const out: Deck = {
    id: CUSTOM_DECK_ID,
    level: "N5",
    group: "vocab",
    title,
    titleJa: "カスタム",
    order: 0,
    items: [],
  };
  const from: Deck[] = [];
  const taken = new Set<string>();
  for (const id of unitIds) {
    const found = items.get(id);
    if (found) {
      const keys = collisionKeys(unitOf(found.deck, found.item));
      if (keys.some((key) => taken.has(key))) continue;
      keys.forEach((key) => taken.add(key));
      out.items.push(found.item);
      from.push(found.deck);
      continue;
    }
    const cloze = questions.get(id);
    if (cloze) {
      (out.questions ??= []).push(cloze.question);
      from.push(cloze.deck);
    }
  }
  if (from.length) {
    out.level = from[0]!.level;
    const groups = new Set<DeckGroup>(from.map((deck) => deck.group));
    if (groups.size === 1) out.group = [...groups][0]!;
  }
  return out;
}

/** "Verbs · Time", from the selected tags in `TAGS` order. */
export function customTitle(selected: Tag[]): string {
  return (Object.keys(TAGS) as Tag[])
    .filter((tag) => selected.includes(tag))
    .map((tag) => TAGS[tag].label)
    .join(" · ");
}

/** A Custom deck for the selected tags: the matching words that need work first. */
export function buildCustomDeck(
  decks: Deck[],
  stats: Stats,
  level: Jlpt,
  selected: Tag[],
  rng: Rng,
  options: PickOptions = {},
): Deck {
  const picked = pickUnits(matchingUnits(decks, level, selected), stats, rng, options);
  return customDeckFrom(
    decks,
    picked.map((unit) => unit.id),
    customTitle(selected),
  );
}
