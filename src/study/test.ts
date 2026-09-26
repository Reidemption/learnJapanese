import type { Deck, Item, Question } from "../types";
import type { Unit } from "./analytics";
import { buildQuestion, type Mode } from "./modes";
import { shuffle, type Rng } from "./rng";
import { hasKanji, parseRuby, toPlain } from "./ruby";
import { levelKanji, levelScript } from "./script";
import { customDeckFrom } from "./tags";

/**
 * A test asks every unit in every mode it can be asked in, with no help on
 * screen, and a unit passes only if every one of its questions is right.
 * See docs/PLAN-test-understanding.md.
 */

/** One answer: the choice picked, or null for "I don't know". */
export type TestAnswers = Record<string, string | null>;

export type QuestionResult = {
  question: Question;
  correct: boolean;
  /** "I don't know", or never answered. Always wrong. */
  skipped: boolean;
};

export type UnitResult = {
  unitId: string;
  passed: boolean;
  questions: QuestionResult[];
};

export type TestScore = {
  units: UnitResult[];
  questions: QuestionResult[];
};

/** The modes a unit is tested in: cloze for a cloze question; meaning, reverse and maybe reading for an item. */
export function testModes(deck: Deck, unitId: string, kanjiSet: ReadonlySet<string>): Mode[] {
  if (deck.questions?.some((q) => q.id === unitId)) return ["cloze"];
  const item = deck.items.find((i) => i.id === unitId);
  if (!item) return [];
  return readable(item, kanjiSet) ? ["meaning", "reverse", "reading"] : ["meaning", "reverse"];
}

/** Whether an item still shows a kanji once its out-of-level kanji are written in kana. */
function readable(item: Item, kanjiSet: ReadonlySet<string>): boolean {
  return hasKanji(toPlain(levelScript(parseRuby(item.ja), kanjiSet)));
}

/**
 * Every question for `units`, shuffled together. Each question takes its
 * distractors from its unit's own deck, or, when that deck is too small to
 * offer three, from every deck of its level and group. It is shown as a test shows it: no
 * furigana or glosses, kanji above the level in kana, and no English line on
 * a reading or cloze prompt.
 */
export function buildTest(units: Unit[], decks: Deck[], rng: Rng): Question[] {
  const byId = new Map(decks.map((deck) => [deck.id, deck]));
  const level = byId.get(units[0]?.deckId ?? "")?.level ?? "N5";
  const kanji = levelKanji(decks, level);
  const questions: Question[] = [];
  for (const unit of units) {
    const deck = byId.get(unit.deckId);
    if (!deck) continue;
    for (const mode of testModes(deck, unit.id, kanji)) {
      const question =
        buildQuestion(deck, unit.id, mode, rng) ??
        buildQuestion(borrowing(deck, decks), unit.id, mode, rng);
      if (question) questions.push(strict(question, deck, unit.id, kanji));
    }
  }
  return shuffle(questions, rng);
}

/** `deck` with the rest of its level and group as extra distractors. */
function borrowing(deck: Deck, decks: Deck[]): Deck {
  const pool = decks
    .filter((d) => d.id !== deck.id && d.level === deck.level && d.group === deck.group)
    .flatMap((d) => d.items);
  return { ...deck, pool };
}

function strict(question: Question, deck: Deck, unitId: string, kanji: ReadonlySet<string>): Question {
  const script = (segments: Question["promptJa"]) => levelScript(segments, kanji);
  let promptJa = script(question.promptJa);
  if (question.kind === "reading") {
    // The practice prompt is the plain text in one piece; rebuild it per
    // segment so kanji above the level can turn into kana.
    const item = deck.items.find((i) => i.id === unitId)!;
    promptJa = script(parseRuby(item.ja));
  }
  const out: Question = {
    ...question,
    promptJa,
    choices: question.choices.map((choice) =>
      choice.ja ? { ...choice, ja: script(choice.ja) } : choice,
    ),
  };
  // Reading and cloze would give the answer away through the meaning.
  if (question.kind === "reading" || question.kind === "cloze") delete out.promptEn;
  return out;
}

/** Questions are ids of the form `<unitId>:<mode>`. */
function unitIdOf(question: Question): string {
  return question.id.slice(0, question.id.lastIndexOf(":"));
}

/** Scores every question, then every unit: a unit passes only if all its questions do. */
export function scoreTest(questions: Question[], answers: TestAnswers): TestScore {
  const results: QuestionResult[] = questions.map((question) => {
    const picked = answers[question.id] ?? null;
    return { question, correct: picked === question.correctId, skipped: picked === null };
  });
  const units = new Map<string, UnitResult>();
  for (const result of results) {
    const unitId = unitIdOf(result.question);
    let unit = units.get(unitId);
    if (!unit) {
      unit = { unitId, passed: true, questions: [] };
      units.set(unitId, unit);
    }
    unit.questions.push(result);
    if (!result.correct) unit.passed = false;
  }
  return { units: [...units.values()], questions: results };
}

/**
 * A practice deck of the units a test failed. Too few words to choose
 * between on their own, so it borrows the rest of their decks as distractors.
 */
export function missedDeck(decks: Deck[], unitIds: string[], title: string): Deck {
  const deck = customDeckFrom(decks, unitIds, title);
  const taken = new Set(deck.items.map((item) => item.id));
  const sources = new Set(
    decks
      .filter((d) => d.items.some((item) => taken.has(item.id)))
      .map((d) => d.id),
  );
  deck.pool = decks
    .filter((d) => sources.has(d.id))
    .flatMap((d) => d.items)
    .filter((item) => !taken.has(item.id));
  return deck;
}
