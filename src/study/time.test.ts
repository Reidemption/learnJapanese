import { describe, expect, it } from "vitest";
import { formatAverage, formatElapsed } from "./time";

describe("formatElapsed", () => {
  it("shows minutes and seconds, and hours only past an hour", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7_900)).toBe("0:07");
    expect(formatElapsed(247_000)).toBe("4:07");
    expect(formatElapsed(3_727_000)).toBe("1:02:07");
  });

  it("never shows a negative time", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});

describe("formatAverage", () => {
  it("divides by the question count", () => {
    expect(formatAverage(34_000, 10)).toBe("3.4 s");
    expect(formatAverage(1_000, 0)).toBe("0.0 s");
  });
});
