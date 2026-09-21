import { describe, expect, it } from "vitest";
import { backupFileName, parseBackup } from "./backup";

const session = {
  uid: "u1",
  deckId: "n5-food",
  mode: "meaning",
  correct: 1,
  total: 2,
  kana: true,
  hints: false,
  at: 1_700_000_000_000,
  items: [
    { itemId: "n5-food-1", mode: "meaning", correct: true },
    { itemId: "n5-food-2", mode: "meaning", correct: false },
  ],
};

function file(body: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, exportedAt: 5, baseline: {}, attempts: [session], ...body });
}

describe("parseBackup", () => {
  it("round-trips a well-formed backup", () => {
    const backup = parseBackup(file({}));
    expect(backup.attempts).toEqual([session]);
    expect(backup.exportedAt).toBe(5);
  });

  it("fills in a missing answer mode and missing assist flags", () => {
    const { kana: _k, hints: _h, ...rest } = session;
    const backup = parseBackup(
      file({ attempts: [{ ...rest, items: [{ itemId: "x", correct: true }] }] }),
    );
    expect(backup.attempts[0]).toMatchObject({ kana: null, hints: null });
    expect(backup.attempts[0]?.items[0]).toEqual({ itemId: "x", mode: "meaning", correct: true });
  });

  it("normalizes legacy baseline entries", () => {
    const backup = parseBackup(file({ baseline: { a: { seen: 3, correct: 1 } } }));
    expect(backup.baseline.a).toMatchObject({ seen: 3, correct: 1, streak: 0, knownAt: null });
  });

  it("rejects files that are not backups, with a readable message", () => {
    expect(() => parseBackup("{nope")).toThrow(/not valid JSON/);
    expect(() => parseBackup("[]")).toThrow(/version/);
    expect(() => parseBackup(file({ version: 2 }))).toThrow(/version: 2/);
    expect(() => parseBackup(file({ attempts: "x" }))).toThrow(/sessions/);
  });

  it("names the broken session", () => {
    expect(() => parseBackup(file({ attempts: [session, { ...session, uid: "" }] }))).toThrow(
      /Session 2 has no uid/,
    );
    expect(() => parseBackup(file({ attempts: [{ ...session, correct: 3 }] }))).toThrow(
      /impossible score/,
    );
    expect(() => parseBackup(file({ attempts: [{ ...session, mode: "flash" }] }))).toThrow(
      /unknown mode/,
    );
    expect(() =>
      parseBackup(file({ attempts: [{ ...session, items: [{ itemId: "x" }] }] })),
    ).toThrow(/answer 1 is malformed/);
  });
});

describe("backupFileName", () => {
  it("uses the local date", () => {
    expect(backupFileName(new Date(2026, 8, 20, 23, 30).getTime())).toBe(
      "learnjapanese-backup-2026-09-20.json",
    );
  });
});
