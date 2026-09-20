import { describe, expect, it } from "vitest";
import { seedFrom, seeded, shuffle } from "./rng";

describe("seeded", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = Array.from({ length: 5 }, seeded(7));
    const b = Array.from({ length: 5 }, seeded(7));
    expect(a).toEqual(b);
  });

  it("differs between seeds", () => {
    expect(Array.from({ length: 5 }, seeded(7))).not.toEqual(
      Array.from({ length: 5 }, seeded(8)),
    );
  });

  it("stays in [0, 1)", () => {
    const rng = seeded(1234);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("seedFrom", () => {
  it("is stable per string and differs between strings", () => {
    expect(seedFrom("n5-food:meaning")).toBe(seedFrom("n5-food:meaning"));
    expect(seedFrom("n5-food:meaning")).not.toBe(seedFrom("n5-food:reading"));
  });
});

describe("shuffle", () => {
  it("keeps every item and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seeded(2));
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(input);
  });

  it("is deterministic with a seeded rng", () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(2))).toEqual(shuffle([1, 2, 3, 4, 5], seeded(2)));
  });

  it("handles empty and single-item arrays", () => {
    expect(shuffle([], seeded(1))).toEqual([]);
    expect(shuffle(["a"], seeded(1))).toEqual(["a"]);
  });
});
