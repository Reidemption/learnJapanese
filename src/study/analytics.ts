/**
 * Pure numbers behind the dashboard. Everything is a function of the decks,
 * the per-unit stats, the session list and "now", so it is testable with
 * fixed data and needs nothing from the network.
 *
 * Days are *local* days: the server never buckets, because it doesn't know
 * the learner's timezone.
 */
import type { AttemptRecord } from "../progress";
import type { Deck, DeckGroup, Jlpt } from "../types";
import { DECK_GROUPS } from "../types";
import { isLearned, isWeak, masteryOf, type ItemStat } from "./mastery";
import type { Rng } from "./rng";
import { pickUnits, type UnitOrder } from "./tags";

type Stats = Record<string, ItemStat>;

/** Anything a session reports a result for: a deck item or a cloze question. */
export type Unit = {
  id: string;
  deckId: string;
  /** Ruby markup: the item's Japanese, or the cloze prompt with its blank. */
  ja: string;
  en: string;
};

export type Split = {
  mastered: number;
  known: number;
  learning: number;
  new: number;
  total: number;
};

export function unitsOf(deck: Deck): Unit[] {
  const items = deck.items.map((item) => ({
    id: item.id,
    deckId: deck.id,
    ja: item.ja,
    en: item.en,
  }));
  const questions = (deck.questions ?? []).map((q) => ({
    id: q.id,
    deckId: deck.id,
    ja: q.prompt,
    en: q.en ?? q.answer,
  }));
  return [...items, ...questions];
}

export function emptySplit(): Split {
  return { mastered: 0, known: 0, learning: 0, new: 0, total: 0 };
}

export function splitOf(units: Unit[], stats: Stats): Split {
  const split = emptySplit();
  for (const unit of units) {
    split[masteryOf(stats[unit.id])] += 1;
    split.total += 1;
  }
  return split;
}

/** Known or mastered: the units with nothing left to practise. */
export function learnedOf(split: Split): number {
  return split.mastered + split.known;
}

/** Share of `split` that is known or mastered, 0–1; 0 for an empty split. */
export function knownRatio(split: Split): number {
  return split.total ? learnedOf(split) / split.total : 0;
}

function atLevel(decks: Deck[], level: Jlpt): Deck[] {
  return decks.filter((deck) => deck.level === level);
}

/** Mastered / known / learning / new over every unit of the level. */
export function coverage(decks: Deck[], stats: Stats, level: Jlpt): Split {
  return splitOf(atLevel(decks, level).flatMap(unitsOf), stats);
}

export type GroupRow = { group: DeckGroup; split: Split };

/** The same split per home-page group, in home-page order; empty groups are left out. */
export function byGroup(decks: Deck[], stats: Stats, level: Jlpt): GroupRow[] {
  const inLevel = atLevel(decks, level);
  return DECK_GROUPS.map((group) => ({
    group,
    split: splitOf(
      inLevel.filter((deck) => deck.group === group).flatMap(unitsOf),
      stats,
    ),
  })).filter((row) => row.split.total > 0);
}

export type DeckRow = { deck: Deck; split: Split };

/** One row per deck of the level, in course order. */
export function byDeck(decks: Deck[], stats: Stats, level: Jlpt): DeckRow[] {
  return atLevel(decks, level).map((deck) => ({ deck, split: splitOf(unitsOf(deck), stats) }));
}

/** Lowest share known first; ties keep course order. */
export function leastLearned(rows: DeckRow[]): DeckRow[] {
  return [...rows].sort((a, b) => knownRatio(a.split) - knownRatio(b.split));
}

/** `YYYY-MM-DD` of the local day `at` falls on. */
export function dayKey(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateOf(key: string, offset = 0): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  // Noon, so a DST shift can never push the date onto a neighbouring day.
  return new Date(y, m - 1, d + offset, 12);
}

/** The day key `offset` calendar days from `key`. Safe across DST changes. */
export function addDays(key: string, offset: number): string {
  return dayKey(dateOf(key, offset).getTime());
}

export type DayActivity = {
  day: string;
  /** 0 = Sunday, as `Date.getDay()`. */
  weekday: number;
  sessions: number;
  answers: number;
  correct: number;
  /** correct / answers, or null on a day without answers. */
  accuracy: number | null;
};

/** Sessions, answers and accuracy for each of the last `days` local days, ending today. */
export function activity(attempts: AttemptRecord[], days: number, now: number): DayActivity[] {
  const byDay = new Map<string, { sessions: number; answers: number; correct: number }>();
  for (const attempt of attempts) {
    const key = dayKey(attempt.at);
    const entry = byDay.get(key) ?? { sessions: 0, answers: 0, correct: 0 };
    entry.sessions += 1;
    entry.answers += attempt.total;
    entry.correct += attempt.correct;
    byDay.set(key, entry);
  }
  const today = dayKey(now);
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const entry = byDay.get(day) ?? { sessions: 0, answers: 0, correct: 0 };
    out.push({
      day,
      weekday: dateOf(day).getDay(),
      ...entry,
      accuracy: entry.answers ? entry.correct / entry.answers : null,
    });
  }
  return out;
}

export type Streaks = { current: number; longest: number };

/**
 * Runs of consecutive study days. The current run is still alive if the last
 * session was yesterday: today just hasn't been studied yet.
 */
export function streaks(attempts: AttemptRecord[], now: number): Streaks {
  const days = new Set(attempts.map((attempt) => dayKey(attempt.at)));
  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of [...days].sort()) {
    run = previous !== undefined && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  const today = dayKey(now);
  let day = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(day)) {
    current += 1;
    day = addDays(day, -1);
  }
  return { current, longest };
}

export type LearnedPoint = { day: string; known: number; mastered: number };

/**
 * Cumulative units that have reached "known", and "mastered", one point per
 * day from the first one to today. Built from `knownAt` and `masteredAt`,
 * which are never cleared, so the lines only go up.
 */
export function learnedOverTime(stats: Stats, now: number): LearnedPoint[] {
  const known = new Map<string, number>();
  const mastered = new Map<string, number>();
  const bump = (map: Map<string, number>, at: number | null) => {
    if (at === null) return;
    const key = dayKey(at);
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const stat of Object.values(stats)) {
    bump(known, stat.knownAt);
    bump(mastered, stat.masteredAt);
  }
  if (!known.size && !mastered.size) return [];
  const days = [...known.keys(), ...mastered.keys()].sort();
  const today = dayKey(now);
  const last = days[days.length - 1]! > today ? days[days.length - 1]! : today;
  const out: LearnedPoint[] = [];
  let k = 0;
  let m = 0;
  for (let day = days[0]!; day <= last; day = addDays(day, 1)) {
    k += known.get(day) ?? 0;
    m += mastered.get(day) ?? 0;
    out.push({ day, known: k, mastered: m });
  }
  return out;
}

/** Only the stats for units of `level`: the rest belong to another level's dashboard. */
export function statsAt(decks: Deck[], stats: Stats, level: Jlpt): Stats {
  const out: Stats = {};
  for (const unit of atLevel(decks, level).flatMap(unitsOf)) {
    const stat = stats[unit.id];
    if (stat) out[unit.id] = stat;
  }
  return out;
}

export type WeakUnit = { unit: Unit; deck: Deck; stat: ItemStat; accuracy: number };

/** Weak units, lowest accuracy first (then the most-seen), at most `n`. */
export function weakest(decks: Deck[], stats: Stats, n: number): WeakUnit[] {
  const out: WeakUnit[] = [];
  for (const deck of decks) {
    for (const unit of unitsOf(deck)) {
      const stat = stats[unit.id];
      if (!stat || !isWeak(stat)) continue;
      out.push({ unit, deck, stat, accuracy: stat.correct / stat.seen });
    }
  }
  return out
    .sort((a, b) => a.accuracy - b.accuracy || b.stat.seen - a.stat.seen)
    .slice(0, n);
}

export type NextUp = {
  deck: Deck;
  /** "learning": has units in progress; "untouched": never studied; "review": the least known. */
  reason: "learning" | "untouched" | "review";
  split: Split;
};

/**
 * What to study next: the deck with the most units in progress, else the
 * first untouched deck, else the least-known deck that isn't fully known.
 */
export function nextUp(decks: Deck[], stats: Stats, level: Jlpt): NextUp | undefined {
  const rows = byDeck(decks, stats, level);
  let best: DeckRow | undefined;
  for (const row of rows) {
    if (row.split.learning > (best?.split.learning ?? 0)) best = row;
  }
  if (best) return { ...best, reason: "learning" };
  const untouched = rows.find((row) => row.split.total > 0 && row.split.new === row.split.total);
  if (untouched) return { ...untouched, reason: "untouched" };
  const review = leastLearned(rows).find((row) => learnedOf(row.split) < row.split.total);
  return review ? { ...review, reason: "review" } : undefined;
}

/** The sets a word test can be built from. See docs/PLAN-test-understanding.md. */
export const WORD_SETS = ["ready", "missed", "weak"] as const;
export type WordSetKind = (typeof WORD_SETS)[number];

/** How many words a word test holds at most. */
export const WORD_TEST_SIZE = 20;

export function isWordSet(value: string): value is WordSetKind {
  return (WORD_SETS as readonly string[]).includes(value);
}

/**
 * Whether a unit belongs in a set:
 *   ready:  known from practice, not yet mastered (the next step up)
 *   missed: failed its most recent test
 *   weak:   flagged weak in practice
 */
export function inWordSet(kind: WordSetKind, stat: ItemStat | undefined): boolean {
  if (kind === "ready") return masteryOf(stat) === "known";
  if (kind === "missed") return !!stat && stat.testedAt !== null && !stat.testPassed;
  return isWeak(stat);
}

/** The words tested longest ago (or never) first. */
export const oldestTested: UnitOrder = (a, b) =>
  (a.stat?.testedAt ?? -Infinity) - (b.stat?.testedAt ?? -Infinity) || a.tie - b.tie;

/**
 * Up to `limit` units of the level in one set, the ones tested longest ago
 * first, never two that would make a question with two right answers.
 */
export function wordSet(
  decks: Deck[],
  stats: Stats,
  level: Jlpt,
  kind: WordSetKind,
  rng: Rng,
  limit = WORD_TEST_SIZE,
): Unit[] {
  const candidates = atLevel(decks, level)
    .flatMap(unitsOf)
    .filter((unit) => inWordSet(kind, stats[unit.id]));
  return pickUnits(candidates, stats, rng, { size: limit, order: oldestTested });
}

/** How many units of the level are in each set, before the cap. */
export function wordSetSizes(decks: Deck[], stats: Stats, level: Jlpt): Record<WordSetKind, number> {
  const units = atLevel(decks, level).flatMap(unitsOf);
  const count = (kind: WordSetKind) => units.filter((unit) => inWordSet(kind, stats[unit.id])).length;
  return { ready: count("ready"), missed: count("missed"), weak: count("weak") };
}

/** A deck needs this many units tested before its pass rate means anything. */
export const STRUGGLING_MIN_TESTED = 5;

export type StrugglingDeck = {
  deck: Deck;
  tested: number;
  failed: number;
  /** passed / tested, of each unit's most recent test. */
  passRate: number;
  weak: number;
};

/**
 * Decks ranked by how many of their tested units failed their most recent
 * test, worst first, then by weak units. A word test's results count
 * towards each word's own deck. Decks with fewer than
 * STRUGGLING_MIN_TESTED tested units, or with nothing failed, are left out.
 */
export function strugglingDecks(decks: Deck[], stats: Stats, level: Jlpt): StrugglingDeck[] {
  const out: StrugglingDeck[] = [];
  for (const deck of atLevel(decks, level)) {
    let tested = 0;
    let failed = 0;
    let weak = 0;
    for (const unit of unitsOf(deck)) {
      const stat = stats[unit.id];
      if (isWeak(stat)) weak += 1;
      if (!stat || stat.testedAt === null) continue;
      tested += 1;
      if (!stat.testPassed) failed += 1;
    }
    if (tested < STRUGGLING_MIN_TESTED || failed === 0) continue;
    out.push({ deck, tested, failed, passRate: (tested - failed) / tested, weak });
  }
  return out.sort((a, b) => a.passRate - b.passRate || b.weak - a.weak);
}

/** The units of a deck to practise after a bad test: failed their last test, or weak. */
export function unitsToPractise(deck: Deck, stats: Stats): Unit[] {
  return unitsOf(deck).filter((unit) => {
    const stat = stats[unit.id];
    return isWeak(stat) || (!!stat && stat.testedAt !== null && !stat.testPassed);
  });
}

/** Units that are known or mastered. */
export function learnedUnits(units: Unit[], stats: Stats): Unit[] {
  return units.filter((unit) => isLearned(stats[unit.id]));
}
