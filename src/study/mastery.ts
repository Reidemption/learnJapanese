/**
 * How well a single unit (a deck item or a cloze question) is learned.
 *
 * The rule is one constant and one pure function so that it can be replayed
 * over the whole answer log, and the Go server applies the same rule — both
 * are checked against testdata/mastery-cases.json.
 */

/** Consecutive correct answers, in any mode, before a unit counts as known. */
export const KNOWN_STREAK = 3;

/** A unit is weak once it has been seen this often at below this accuracy. */
export const WEAK_MIN_SEEN = 3;
export const WEAK_ACCURACY = 0.6;

export type ItemStat = {
  seen: number;
  correct: number;
  /** Consecutive correct answers up to now; a wrong answer resets it. */
  streak: number;
  /** Unix millis. Null for counts recorded before dates were kept. */
  firstAt: number | null;
  lastAt: number | null;
  /** The first time the streak reached KNOWN_STREAK. Never cleared. */
  knownAt: number | null;
};

export type Mastery = "new" | "learning" | "known";

export function emptyStat(): ItemStat {
  return { seen: 0, correct: 0, streak: 0, firstAt: null, lastAt: null, knownAt: null };
}

export function applyAnswer(stat: ItemStat | undefined, correct: boolean, at: number): ItemStat {
  const prev = stat ?? emptyStat();
  const streak = correct ? prev.streak + 1 : 0;
  return {
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    streak,
    firstAt: prev.firstAt ?? at,
    lastAt: at,
    knownAt: prev.knownAt ?? (streak >= KNOWN_STREAK ? at : null),
  };
}

export function masteryOf(stat: ItemStat | undefined): Mastery {
  if (!stat || stat.seen === 0) return "new";
  return stat.streak >= KNOWN_STREAK ? "known" : "learning";
}

export function isWeak(stat: ItemStat | undefined): boolean {
  if (!stat || stat.seen < WEAK_MIN_SEEN) return false;
  return stat.correct / stat.seen < WEAK_ACCURACY;
}

/**
 * Reads a stat from storage or the network, filling in anything missing.
 * Entries from before streaks existed only have `seen`/`correct`.
 */
export function normalizeStat(raw: unknown): ItemStat | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const count = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  const time = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    seen: count(value.seen),
    correct: count(value.correct),
    streak: count(value.streak),
    firstAt: time(value.firstAt),
    lastAt: time(value.lastAt),
    knownAt: time(value.knownAt),
  };
}

export type Answer = { itemId: string; correct: boolean; at: number };

/**
 * Replays answers (oldest first) on top of a baseline: counts that predate
 * the answer log, or answers that have been folded out of it.
 */
export function rebuildStats(
  answers: Answer[],
  baseline: Record<string, ItemStat> = {},
): Record<string, ItemStat> {
  const stats: Record<string, ItemStat> = {};
  for (const [id, stat] of Object.entries(baseline)) stats[id] = { ...stat };
  for (const answer of answers) {
    stats[answer.itemId] = applyAnswer(stats[answer.itemId], answer.correct, answer.at);
  }
  return stats;
}
