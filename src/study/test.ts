import type { Deck, Item, Question } from "../types";
import type { Unit } from "./analytics";
import { candidateOf, levelPool, nearMiss, rankCandidates, type Candidate } from "./distractors";
import { CHOICE_IDS, buildQuestion, type Mode } from "./modes";
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
 * Every question for `units`, shuffled together, shown as a test shows it: no
 * furigana or glosses, kanji above the level in kana, and no English line on
 * a reading or cloze prompt.
 *
 * Wrong choices come from every deck of the unit's level and group, the
 * closest first (`rankCandidates`, `kanaVariants`), so topic, length or shape
 * can't rule them out. Cloze keeps its authored distractors.
 */
export function buildTest(units: Unit[], decks: Deck[], rng: Rng): Question[] {
  const byId = new Map(decks.map((deck) => [deck.id, deck]));
  const level = byId.get(units[0]?.deckId ?? "")?.level ?? "N5";
  const kanji = levelKanji(decks, level);
  const pools = new Map<string, Candidate[]>();
  const poolOf = (deck: Deck): Candidate[] => {
    const key = `${deck.level}:${deck.group}`;
    if (!pools.has(key)) pools.set(key, levelPool(decks, deck.level, deck.group));
    return pools.get(key)!;
  };

  const questions: Question[] = [];
  for (const unit of units) {
    const deck = byId.get(unit.deckId);
    if (!deck) continue;
    const item = deck.items.find((i) => i.id === unit.id);
    for (const mode of testModes(deck, unit.id, kanji)) {
      const question =
        (item && mode !== "cloze" && hardQuestion(deck, item, mode, poolOf(deck), kanji, rng)) ||
        buildQuestion(deck, unit.id, mode, rng) ||
        buildQuestion(borrowing(deck, decks), unit.id, mode, rng);
      if (question) questions.push(strict(question, deck, unit.id, kanji));
    }
  }
  return shuffle(questions, rng);
}

/**
 * A test question with ranked, level-wide distractors, or undefined when the
 * pool can't give three distinct ones (the caller falls back to the deck's).
 */
function hardQuestion(
  deck: Deck,
  item: Item,
  mode: Exclude<Mode, "cloze">,
  pool: Candidate[],
  kanji: ReadonlySet<string>,
  rng: Rng,
): Question | undefined {
  const target = candidateOf(deck, item);
  const base = { id: `${item.id}:${mode}`, jlpt: deck.level, kind: mode, correctId: CHOICE_IDS[0]! };

  if (mode === "meaning") {
    const picked = distinct(item.en, rankCandidates(target, pool, "meaning", rng).map((c) => c.item.en));
    if (!picked) return undefined;
    return {
      ...base,
      promptJa: parseRuby(item.ja),
      choices: picked.map((en, i) => ({ id: CHOICE_IDS[i]!, en })),
    };
  }

  if (mode === "reverse") {
    const shown = (c: Candidate) => levelScript(parseRuby(c.item.ja), kanji);
    const ranked = rankCandidates(target, pool, "reverse", rng);
    const picked = distinct(toPlain(shown(target)), ranked.map((c) => toPlain(shown(c))));
    if (!picked) return undefined;
    const segments = new Map([target, ...ranked].map((c) => [toPlain(shown(c)), shown(c)]));
    return {
      ...base,
      promptEn: item.en,
      promptJa: [],
      choices: picked.map((text, i) => ({ id: CHOICE_IDS[i]!, ja: segments.get(text)! })),
    };
  }

  // Reading: two pairs, each a reading and a near miss of it, so the answer
  // is never the one every other choice is spelled from. A homograph's
  // reading would also be right, so it is never offered.
  const right = new Set(pool.filter((c) => c.plain === target.plain).map((c) => c.kana));
  right.add(target.kana);
  const others = pool
    .filter((c) => !right.has(c.kana))
    .map((c) => ({ kana: c.kana, gap: Math.abs(c.kana.length - target.kana.length), tie: rng() }))
    .sort((a, b) => a.gap - b.gap || a.tie - b.tie)
    .map((c) => c.kana);
  const decoy = others[0];
  const taken = new Set([...right, ...(decoy ? [decoy] : [])]);
  const miss = nearMiss(target.kana, rng, (v) => !taken.has(v));
  if (miss) taken.add(miss);
  const decoyMiss = decoy ? nearMiss(decoy, rng, (v) => !taken.has(v)) : undefined;
  const picked = distinct(
    target.kana,
    [miss, decoy, decoyMiss, ...others.slice(1)].filter((k): k is string => k !== undefined),
  );
  if (!picked) return undefined;
  return {
    ...base,
    promptJa: [{ ja: target.plain }],
    promptEn: item.en,
    choices: picked.map((kana, i) => ({ id: CHOICE_IDS[i]!, ja: [{ ja: kana }] })),
  };
}

/** The answer then the first three candidates that differ from it and from each other. */
function distinct(answer: string, candidates: string[]): string[] | undefined {
  const picked = [answer];
  for (const text of candidates) {
    if (picked.length === CHOICE_IDS.length) break;
    if (!picked.includes(text)) picked.push(text);
  }
  return picked.length === CHOICE_IDS.length ? picked : undefined;
}

/** `deck` with the rest of its level and group as extra distractors: the last resort. */
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
