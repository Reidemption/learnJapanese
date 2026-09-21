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
import { isWeak, masteryOf, type ItemStat } from "./mastery";

type Stats = Record<string, ItemStat>;

/** Anything a session reports a result for: a deck item or a cloze question. */
export type Unit = {
  id: string;
  deckId: string;
  /** Ruby markup: the item's Japanese, or the cloze prompt with its blank. */
  ja: string;
  en: string;
};

export type Split = { known: number; learning: number; new: number; total: number };

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
  return { known: 0, learning: 0, new: 0, total: 0 };
}

export function splitOf(units: Unit[], stats: Stats): Split {
  const split = emptySplit();
  for (const unit of units) {
    split[masteryOf(stats[unit.id])] += 1;
    split.total += 1;
  }
  return split;
}

/** Share of `split` that is known, 0–1; 0 for an empty split. */
export function knownRatio(split: Split): number {
  return split.total ? split.known / split.total : 0;
}

function atLevel(decks: Deck[], level: Jlpt): Deck[] {
  return decks.filter((deck) => deck.level === level);
}

/** Known / learning / new over every unit of the level. */
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

export type LearnedPoint = { day: string; known: number };

/**
 * Cumulative units that have reached "known", one point per day from the
 * first one to today. Built from `knownAt`, which is never cleared, so the
 * line only goes up.
 */
export function learnedOverTime(stats: Stats, now: number): LearnedPoint[] {
  const perDay = new Map<string, number>();
  for (const stat of Object.values(stats)) {
    if (stat.knownAt === null) continue;
    const key = dayKey(stat.knownAt);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  if (!perDay.size) return [];
  const days = [...perDay.keys()].sort();
  const today = dayKey(now);
  const last = days[days.length - 1]! > today ? days[days.length - 1]! : today;
  const out: LearnedPoint[] = [];
  let known = 0;
  for (let day = days[0]!; day <= last; day = addDays(day, 1)) {
    known += perDay.get(day) ?? 0;
    out.push({ day, known });
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
  const review = leastLearned(rows).find((row) => row.split.known < row.split.total);
  return review ? { ...review, reason: "review" } : undefined;
}
