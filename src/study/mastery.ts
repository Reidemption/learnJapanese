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
  /** The unit's most recent test, deck or word, and whether it passed all of it. */
  testedAt: number | null;
  testPassed: boolean;
  /** The first test the unit passed. Never cleared, like `knownAt`. */
  masteredAt: number | null;
};

/**
 * `mastered` sits above `known`: the unit's most recent test passed every
 * one of its questions. Only tests change it; see docs/PLAN-test-understanding.md.
 */
export type Mastery = "new" | "learning" | "known" | "mastered";

export function emptyStat(): ItemStat {
  return {
    seen: 0,
    correct: 0,
    streak: 0,
    firstAt: null,
    lastAt: null,
    knownAt: null,
    testedAt: null,
    testPassed: false,
    masteredAt: null,
  };
}

/**
 * Records one answer. `testPassed` is set on a test answer only: whether the
 * unit passed that whole test (every one of its questions in it right).
 */
export function applyAnswer(
  stat: ItemStat | undefined,
  correct: boolean,
  at: number,
  testPassed?: boolean,
): ItemStat {
  const prev = stat ?? emptyStat();
  const streak = correct ? prev.streak + 1 : 0;
  const next: ItemStat = {
    ...prev,
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    streak,
    firstAt: prev.firstAt ?? at,
    lastAt: at,
    knownAt: prev.knownAt ?? (streak >= KNOWN_STREAK ? at : null),
  };
  if (testPassed !== undefined) {
    next.testedAt = at;
    next.testPassed = testPassed;
    next.masteredAt = prev.masteredAt ?? (testPassed ? at : null);
  }
  return next;
}

export function masteryOf(stat: ItemStat | undefined): Mastery {
  if (!stat || stat.seen === 0) return "new";
  if (stat.testPassed) return "mastered";
  return stat.streak >= KNOWN_STREAK ? "known" : "learning";
}

/** Known or mastered: the practice streak is there, or a test proved it. */
export function isLearned(stat: ItemStat | undefined): boolean {
  const mastery = masteryOf(stat);
  return mastery === "known" || mastery === "mastered";
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
    testedAt: time(value.testedAt),
    testPassed: value.testPassed === true,
    masteredAt: time(value.masteredAt),
  };
}

/** `test`: the uid of the test session the answer belongs to. */
export type Answer = { itemId: string; correct: boolean; at: number; test?: string };

/** One unit in one test. */
function testKey(test: string, itemId: string): string {
  return JSON.stringify([test, itemId]);
}

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
  // A unit passes a test only if every one of its answers in it is right.
  const passed = new Map<string, boolean>();
  for (const answer of answers) {
    if (answer.test === undefined) continue;
    const key = testKey(answer.test, answer.itemId);
    passed.set(key, (passed.get(key) ?? true) && answer.correct);
  }
  for (const answer of answers) {
    const testPassed =
      answer.test === undefined ? undefined : passed.get(testKey(answer.test, answer.itemId));
    stats[answer.itemId] = applyAnswer(stats[answer.itemId], answer.correct, answer.at, testPassed);
  }
  return stats;
}
