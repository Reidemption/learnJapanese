import { describe, expect, it } from "vitest";
import { decks as allDecks, decksFor } from "../content";
import type { AttemptRecord } from "../progress";
import type { Deck } from "../types";
import {
  activity,
  addDays,
  byDeck,
  byGroup,
  coverage,
  dayKey,
  leastLearned,
  learnedOverTime,
  nextUp,
  statsAt,
  streaks,
  unitsOf,
  weakest,
} from "./analytics";
import { emptyStat, type ItemStat } from "./mastery";

// vite.config.ts pins TZ to America/Denver: DST started 2026-03-08 and ends 2026-11-01.
const local = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

function stat(partial: Partial<ItemStat>): ItemStat {
  return { ...emptyStat(), ...partial };
}

const known = (knownAt: number | null = null) =>
  stat({ seen: 3, correct: 3, streak: 3, knownAt });
const learning = (seen = 1, correct = 0) => stat({ seen, correct, streak: 0 });

function deck(id: string, group: Deck["group"], items: number, questions = 0, order = 0): Deck {
  return {
    id,
    level: "N5",
    group,
    title: id,
    titleJa: id,
    order,
    items: Array.from({ length: items }, (_, i) => ({ id: `${id}-${i}`, ja: `語${i}`, en: `w${i}` })),
    questions: Array.from({ length: questions }, (_, i) => ({
      id: `${id}-q${i}`,
      prompt: "___です",
      en: `q${i}`,
      answer: "これ",
      distractors: ["a", "b", "c"],
    })),
  };
}

const greetings = deck("greet", "phrases", 4, 0, 1);
const food = deck("food", "vocab", 3, 2, 2);
const kanji = deck("kanji", "kanji", 2, 0, 3);
const n4 = { ...deck("n4-verbs", "verbs", 5, 0, 1), level: "N4" as const };
const decks = [greetings, food, kanji, n4];

function attempt(at: number, correct = 8, total = 10): AttemptRecord {
  return { uid: `u${at}`, deckId: "food", mode: "meaning", correct, total, kana: true, hints: true, at };
}

describe("units and coverage", () => {
  it("counts every item and cloze question as a unit", () => {
    expect(unitsOf(food).map((u) => u.id)).toEqual(["food-0", "food-1", "food-2", "food-q0", "food-q1"]);
  });

  it("splits a level into known / learning / new", () => {
    const stats = { "greet-0": known(), "food-q0": learning(), "n4-verbs-0": known() };
    expect(coverage(decks, stats, "N5")).toEqual({ known: 1, learning: 1, new: 9, total: 11 });
    expect(coverage(decks, stats, "N4")).toEqual({ known: 1, learning: 0, new: 4, total: 5 });
  });

  it("treats empty progress as all new", () => {
    expect(coverage(decks, {}, "N5")).toEqual({ known: 0, learning: 0, new: 11, total: 11 });
    expect(nextUp(decks, {}, "N5")).toMatchObject({ deck: greetings, reason: "untouched" });
    expect(weakest(decks, {}, 10)).toEqual([]);
    expect(learnedOverTime({}, local(2026, 5, 1))).toEqual([]);
    expect(streaks([], local(2026, 5, 1))).toEqual({ current: 0, longest: 0 });
    expect(activity([], 3, local(2026, 5, 1)).every((d) => d.sessions === 0 && d.accuracy === null)).toBe(true);
  });

  it("totals every N5 item and question in the real content", () => {
    const n5 = decksFor("N5");
    const expected = n5.reduce((n, d) => n + d.items.length + (d.questions?.length ?? 0), 0);
    expect(coverage(allDecks, {}, "N5").total).toBe(expected);
    expect(byGroup(allDecks, {}, "N5").reduce((n, row) => n + row.split.total, 0)).toBe(expected);
  });

  it("groups in home-page order and leaves out empty groups", () => {
    const rows = byGroup(decks, { "kanji-0": known() }, "N5");
    expect(rows.map((r) => r.group)).toEqual(["phrases", "vocab", "kanji"]);
    expect(rows[2]!.split).toEqual({ known: 1, learning: 0, new: 1, total: 2 });
  });

  it("sorts decks by least learned, keeping course order on ties", () => {
    const stats = { "greet-0": known(), "greet-1": known(), "kanji-0": known() };
    const rows = byDeck(decks, stats, "N5");
    expect(rows.map((r) => r.deck.id)).toEqual(["greet", "food", "kanji"]);
    expect(leastLearned(rows).map((r) => r.deck.id)).toEqual(["food", "greet", "kanji"]);
  });
});

describe("activity", () => {
  it("buckets sessions into local days across midnight", () => {
    const now = local(2026, 5, 2, 9);
    const days = activity(
      [attempt(local(2026, 5, 1, 23, 59), 5, 10), attempt(local(2026, 5, 2, 0, 1), 10, 10)],
      2,
      now,
    );
    expect(days).toEqual([
      { day: "2026-05-01", weekday: 5, sessions: 1, answers: 10, correct: 5, accuracy: 0.5 },
      { day: "2026-05-02", weekday: 6, sessions: 1, answers: 10, correct: 10, accuracy: 1 },
    ]);
  });

  it("keeps one bucket per calendar day across a DST change", () => {
    // 2026-03-08 is 23 hours long in Denver.
    const days = activity([attempt(local(2026, 3, 8, 23, 30)), attempt(local(2026, 3, 9, 0, 30))], 4, local(2026, 3, 9, 20));
    expect(days.map((d) => d.day)).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(days.map((d) => d.sessions)).toEqual([0, 0, 1, 1]);
    // And the fall-back day, 25 hours long.
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(dayKey(local(2026, 11, 1, 23, 59))).toBe("2026-11-01");
  });

  it("really runs in a zone with DST", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(new Date(2026, 6, 1).getTimezoneOffset());
  });
});

describe("streaks", () => {
  const days = (...ds: number[]) => ds.map((d) => attempt(local(2026, 5, d, 20)));

  it("is broken by one missed day", () => {
    expect(streaks(days(1, 2, 3, 5, 6), local(2026, 5, 6, 21))).toEqual({ current: 2, longest: 3 });
  });

  it("is still alive when yesterday had a session but today has none yet", () => {
    expect(streaks(days(3, 4, 5), local(2026, 5, 6, 8))).toEqual({ current: 3, longest: 3 });
  });

  it("is over once a whole day passes without a session", () => {
    expect(streaks(days(3, 4, 5), local(2026, 5, 7, 8))).toEqual({ current: 0, longest: 3 });
  });

  it("counts several sessions on one day once, and spans a DST change", () => {
    const list = [...days(7), attempt(local(2026, 3, 7, 22)), attempt(local(2026, 3, 8, 23)), attempt(local(2026, 3, 9, 1))];
    expect(streaks(list, local(2026, 3, 9, 12))).toEqual({ current: 3, longest: 3 });
  });
});

describe("learned over time", () => {
  it("accumulates first-known dates, one point per day up to today", () => {
    const stats = {
      a: known(local(2026, 5, 1, 10)),
      b: known(local(2026, 5, 1, 22)),
      c: learning(4, 1), // knownAt kept after a reset
      d: learning(),
    };
    stats.c.knownAt = local(2026, 5, 3);
    expect(learnedOverTime(stats, local(2026, 5, 4))).toEqual([
      { day: "2026-05-01", known: 2 },
      { day: "2026-05-02", known: 2 },
      { day: "2026-05-03", known: 3 },
      { day: "2026-05-04", known: 3 },
    ]);
  });

  it("only counts the level's units", () => {
    const stats = { "greet-0": known(1), "n4-verbs-0": known(1) };
    expect(Object.keys(statsAt(decks, stats, "N5"))).toEqual(["greet-0"]);
  });
});

describe("weakest", () => {
  it("lists weak units, lowest accuracy then most seen, with their deck", () => {
    const stats = {
      "greet-0": learning(5, 1), // 20%
      "greet-1": learning(3, 1), // 33%
      "food-q1": learning(6, 2), // 33%, seen more
      "food-0": learning(2, 0), // too few to be weak
      "kanji-0": learning(5, 3), // 60%: not weak
    };
    const list = weakest(decks, stats, 10);
    expect(list.map((w) => w.unit.id)).toEqual(["greet-0", "food-q1", "greet-1"]);
    expect(list[1]).toMatchObject({ deck: food, unit: { en: "q1" } });
    expect(weakest(decks, stats, 1)).toHaveLength(1);
  });
});

describe("next up", () => {
  it("prefers the deck with the most units in progress", () => {
    const stats = { "greet-0": learning(), "food-0": learning(), "food-1": learning() };
    expect(nextUp(decks, stats, "N5")).toMatchObject({ deck: food, reason: "learning" });
  });

  it("falls back to the first untouched deck", () => {
    const stats = { "greet-0": known(), "greet-1": known(), "greet-2": known(), "greet-3": known() };
    expect(nextUp(decks, stats, "N5")).toMatchObject({ deck: food, reason: "untouched" });
  });

  it("then to the least known deck, and to nothing once all is known", () => {
    const all = Object.fromEntries(
      [greetings, food, kanji].flatMap(unitsOf).map((u) => [u.id, known()]),
    );
    expect(nextUp(decks, all, "N5")).toBeUndefined();
    const almost = { ...all, "kanji-1": stat({ seen: 1, correct: 1, streak: 1 }) };
    // "kanji-1" is learning, so it's picked for that reason first.
    expect(nextUp(decks, almost, "N5")).toMatchObject({ deck: kanji, reason: "learning" });
  });
});
