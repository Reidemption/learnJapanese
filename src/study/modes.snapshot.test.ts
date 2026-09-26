import { describe, expect, it } from "vitest";
import { decks } from "../content";
import { MODES, buildQuestions } from "./modes";
import { seeded } from "./rng";

/**
 * Practice questions for a fixed seed. Tests get harder choices of their
 * own; practice must stay exactly as it was, so any change here is a
 * deliberate one.
 */
describe("practice questions", () => {
  const sample = ["n5-food", "n5-verbs-1", "n5-kanji-body", "n5-particles"];

  it.each(sample)("%s is unchanged", (id) => {
    const deck = decks.find((d) => d.id === id)!;
    const built = MODES.map((mode) =>
      buildQuestions(deck, mode, seeded(2026)).map((q) => ({
        id: q.id,
        choices: q.choices.map((c) => c.en ?? (c.ja ?? []).map((s) => s.ja).join("")),
      })),
    );
    expect(built).toMatchSnapshot();
  });
});
