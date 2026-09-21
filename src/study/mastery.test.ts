import { describe, expect, it } from "vitest";
import fixture from "../../testdata/mastery-cases.json";
import {
  KNOWN_STREAK,
  applyAnswer,
  isWeak,
  masteryOf,
  normalizeStat,
  rebuildStats,
  type ItemStat,
} from "./mastery";

function stat(partial: Partial<ItemStat>): ItemStat {
  return { seen: 0, correct: 0, streak: 0, firstAt: null, lastAt: null, knownAt: null, ...partial };
}

describe("shared fixture (also read by the Go tests)", () => {
  it("uses the same threshold", () => {
    expect(fixture.knownStreak).toBe(KNOWN_STREAK);
  });

  for (const c of fixture.cases) {
    it(c.name, () => {
      const baseline = "baseline" in c ? (c.baseline as ItemStat) : undefined;
      let current = baseline;
      c.answers.forEach((answer, i) => {
        current = applyAnswer(current, answer.correct, answer.at);
        expect(current, `after answer ${i + 1}`).toEqual(c.expected[i]);
      });

      // Replaying the log gives the same result as recording answer by answer.
      const rebuilt = rebuildStats(
        c.answers.map((a) => ({ itemId: "x", ...a })),
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

  it("does not mutate the baseline", () => {
    const base = { a: stat({ seen: 2, correct: 1 }) };
    rebuildStats([{ itemId: "a", correct: true, at: 5 }], base);
    expect(base.a.seen).toBe(2);
  });
});
