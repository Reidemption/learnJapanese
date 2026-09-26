import { describe, expect, it } from "vitest";
import fixture from "../../testdata/mastery-cases.json";
import {
  KNOWN_STREAK,
  applyAnswer,
  emptyStat,
  isWeak,
  masteryOf,
  normalizeStat,
  rebuildStats,
  type ItemStat,
} from "./mastery";

function stat(partial: Partial<ItemStat>): ItemStat {
  return { ...emptyStat(), ...partial };
}

type FixtureAnswer = { correct: boolean; at: number; testPassed?: boolean };

describe("shared fixture (also read by the Go tests)", () => {
  it("uses the same threshold", () => {
    expect(fixture.knownStreak).toBe(KNOWN_STREAK);
  });

  for (const c of fixture.cases) {
    it(c.name, () => {
      const baseline = "baseline" in c ? (c.baseline as ItemStat) : undefined;
      const answers = c.answers as FixtureAnswer[];
      let current = baseline;
      answers.forEach((answer, i) => {
        current = applyAnswer(current, answer.correct, answer.at, answer.testPassed);
        expect(current, `after answer ${i + 1}`).toEqual(c.expected[i]);
      });

      // Replaying the log gives the same result as recording answer by answer.
      // A test answer's test is the one at the same time; the rebuild works
      // out whether the unit passed it.
      const rebuilt = rebuildStats(
        answers.map(({ testPassed, ...a }) => ({
          itemId: "x",
          ...a,
          ...(testPassed === undefined ? {} : { test: `t${a.at}` }),
        })),
        baseline ? { x: baseline } : {},
      );
      expect(rebuilt.x).toEqual(c.expected.at(-1));
    });
  }
});

describe("masteryOf", () => {
  it("walks new → learning → known and back", () => {
    let s: ItemStat | undefined;
    expect(masteryOf(s)).toBe("new");
    s = applyAnswer(s, true, 1);
    expect(masteryOf(s)).toBe("learning");
    s = applyAnswer(applyAnswer(s, true, 2), true, 3);
    expect(masteryOf(s)).toBe("known");
    s = applyAnswer(s, false, 4);
    expect(masteryOf(s)).toBe("learning");
    expect(s.knownAt).toBe(3);
  });

  it("reaches mastered only through a test, deck or word", () => {
    let s: ItemStat | undefined;
    for (let at = 1; at <= 10; at++) s = applyAnswer(s, true, at);
    expect(masteryOf(s)).toBe("known");
    s = applyAnswer(s, true, 11, true);
    expect(masteryOf(s)).toBe("mastered");
  });

  it("keeps mastered through practice mistakes, and drops it on a failed test", () => {
    let s = applyAnswer(undefined, true, 1, true);
    s = applyAnswer(applyAnswer(s, false, 2), false, 3);
    expect(masteryOf(s)).toBe("mastered");
    s = applyAnswer(s, false, 4, false);
    expect(masteryOf(s)).toBe("learning");
    expect(s.masteredAt).toBe(1);
  });

  it("treats an empty stat as new", () => {
    expect(masteryOf(stat({}))).toBe("new");
  });
});

describe("isWeak", () => {
  it("needs at least three answers", () => {
    expect(isWeak(stat({ seen: 2, correct: 0 }))).toBe(false);
    expect(isWeak(stat({ seen: 3, correct: 0 }))).toBe(true);
  });

  it("flags accuracy below 60%, not at it", () => {
    expect(isWeak(stat({ seen: 100, correct: 59 }))).toBe(true);
    expect(isWeak(stat({ seen: 100, correct: 60 }))).toBe(false);
    expect(isWeak(stat({ seen: 5, correct: 3 }))).toBe(false);
  });

  it("is false for units never seen", () => {
    expect(isWeak(undefined)).toBe(false);
  });
});

describe("normalizeStat", () => {
  it("fills in fields missing from legacy entries", () => {
    expect(normalizeStat({ seen: 4, correct: 3 })).toEqual(stat({ seen: 4, correct: 3 }));
  });

  it("rejects junk", () => {
    expect(normalizeStat(null)).toBeUndefined();
    expect(normalizeStat("nope")).toBeUndefined();
    expect(normalizeStat({ seen: -2, correct: "x", knownAt: "soon" })).toEqual(stat({}));
  });
});

describe("rebuildStats", () => {
  it("keeps baseline units that have no answers", () => {
    const base = { a: stat({ seen: 2, correct: 1 }) };
    expect(rebuildStats([], base)).toEqual(base);
  });

  it("fails a unit on a test when any of its answers in that test is wrong", () => {
    const stats = rebuildStats([
      { itemId: "a", correct: true, at: 1, test: "t1" },
      { itemId: "b", correct: true, at: 1, test: "t1" },
      { itemId: "a", correct: false, at: 1, test: "t1" },
      { itemId: "b", correct: true, at: 1, test: "t1" },
    ]);
    expect(masteryOf(stats.a)).toBe("learning");
    expect(masteryOf(stats.b)).toBe("mastered");
    expect(stats.a).toMatchObject({ testedAt: 1, testPassed: false, masteredAt: null });
  });

  it("does not mutate the baseline", () => {
    const base = { a: stat({ seen: 2, correct: 1 }) };
    rebuildStats([{ itemId: "a", correct: true, at: 5 }], base);
    expect(base.a.seen).toBe(2);
  });
});
