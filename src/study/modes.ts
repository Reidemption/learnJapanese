import type { Choice, Deck, DeckQuestion, Item, Question, RubySegment } from "../types";
import { hasKanji, parseRuby, toKana, toPlain } from "./ruby";
import { seedFrom, seeded, shuffle, type Rng } from "./rng";

export const MODES = ["meaning", "reverse", "reading", "cloze"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  meaning: "Meaning",
  reverse: "Recall",
  reading: "Reading",
  cloze: "Fill in the blank",
};

export const MODE_HINTS: Record<Mode, string> = {
  meaning: "Japanese → English",
  reverse: "English → Japanese",
  reading: "Kanji → kana",
  cloze: "Complete the sentence",
};

/** A quiz needs a real choice between options, so anything shorter is not offered. */
const MIN_QUESTIONS = 4;
const CHOICE_IDS = ["a", "b", "c", "d"];
const DISTRACTORS = CHOICE_IDS.length - 1;

export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

/**
 * Builds a full set of questions for one deck in one mode.
 *
 * Distractors come from the other items in the same deck, which keeps them
 * plausible (same topic) and means content only has to be authored once.
 * Questions with too few usable distractors are dropped rather than shown
 * with fewer than four choices.
 */
export function buildQuestions(deck: Deck, mode: Mode, rng: Rng): Question[] {
  if (mode === "cloze") {
    return shuffle(deck.questions ?? [], rng).map((question) => clozeQuestion(deck, question));
  }
  const usable = USABLE[mode];
  const pool = poolOf(deck, usable);
  const questions: Question[] = [];
  for (const item of shuffle(deck.items.filter(usable), rng)) {
    const question = BUILDERS[mode](deck, item, pool, rng);
    if (question) questions.push(question);
  }
  return questions;
}

/**
 * One question: unit `unitId` of `deck` (an item, or a cloze question for
 * `cloze`) in `mode`, with distractors from the same deck. Undefined when the
 * unit can't be asked that way.
 */
export function buildQuestion(
  deck: Deck,
  unitId: string,
  mode: Mode,
  rng: Rng,
): Question | undefined {
  if (mode === "cloze") {
    const question = deck.questions?.find((q) => q.id === unitId);
    return question && clozeQuestion(deck, question);
  }
  const usable = USABLE[mode];
  const item = deck.items.find((i) => i.id === unitId);
  if (!item || !usable(item)) return undefined;
  return BUILDERS[mode](deck, item, poolOf(deck, usable), rng);
}

/** The modes this deck can actually fill, in display order. */
export function availableModes(deck: Deck): Mode[] {
  const rng = seeded(seedFrom(deck.id));
  // A deck that borrows distractors can quiz on even a single word.
  const min = deck.pool ? 1 : MIN_QUESTIONS;
  return MODES.filter((mode) => buildQuestions(deck, mode, rng).length >= min);
}

/** A stable per-deck/mode seed, so "the same quiz" is reproducible. */
export function sessionRng(deckId: string, mode: Mode, seed?: number): Rng {
  return seeded(seed ?? seedFrom(`${deckId}:${mode}`));
}

type ItemMode = Exclude<Mode, "cloze">;
type Builder = (deck: Deck, item: Item, pool: Item[], rng: Rng) => Question | undefined;

const USABLE: Record<ItemMode, (item: Item) => boolean> = {
  meaning: () => true,
  reverse: () => true,
  reading: (item) => hasKanji(item.ja),
};

/** Distractor candidates: the deck's items plus any it borrows. */
function poolOf(deck: Deck, usable: (item: Item) => boolean): Item[] {
  return [...deck.items, ...(deck.pool ?? [])].filter(usable);
}

function meaningQuestion(deck: Deck, item: Item, pool: Item[], rng: Rng): Question | undefined {
  const others = pickDistractors(item, pool, rng, (i) => i.en);
  if (!others) return undefined;
  const choices = [item, ...others].map((i, index) => ({
    id: CHOICE_IDS[index]!,
    en: i.en,
  }));
  return {
    id: `${item.id}:meaning`,
    jlpt: deck.level,
    kind: "meaning",
    promptJa: parseRuby(item.ja),
    choices,
    correctId: CHOICE_IDS[0]!,
  };
}

function reverseQuestion(deck: Deck, item: Item, pool: Item[], rng: Rng): Question | undefined {
  const others = pickDistractors(item, pool, rng, (i) => toPlain(parseRuby(i.ja)));
  if (!others) return undefined;
  const choices = [item, ...others].map((i, index) => ({
    id: CHOICE_IDS[index]!,
    ja: parseRuby(i.ja),
  }));
  return {
    id: `${item.id}:reverse`,
    jlpt: deck.level,
    kind: "reverse",
    promptEn: item.en,
    promptJa: [],
    choices,
    correctId: CHOICE_IDS[0]!,
  };
}

function readingQuestion(deck: Deck, item: Item, pool: Item[], rng: Rng): Question | undefined {
  const kana = (i: Item): string => toKana(parseRuby(i.ja));
  const others = pickDistractors(item, pool, rng, kana);
  if (!others) return undefined;
  const choices = [item, ...others].map((i, index) => ({
    id: CHOICE_IDS[index]!,
    ja: [{ ja: kana(i) }] as RubySegment[],
  }));
  return {
    id: `${item.id}:reading`,
    jlpt: deck.level,
    kind: "reading",
    // Furigana stripped: reading the kanji is the whole point of this mode.
    promptJa: [{ ja: toPlain(parseRuby(item.ja)) }],
    promptEn: item.en,
    choices,
    correctId: CHOICE_IDS[0]!,
  };
}

function clozeQuestion(deck: Deck, question: DeckQuestion): Question {
  const choices: Choice[] = [question.answer, ...question.distractors]
    .slice(0, CHOICE_IDS.length)
    .map((text, index) => ({ id: CHOICE_IDS[index]!, ja: parseRuby(text) }));
  return {
    id: `${question.id}:cloze`,
    jlpt: deck.level,
    kind: "cloze",
    promptJa: parseRuby(question.prompt),
    promptEn: question.en,
    choices,
    correctId: CHOICE_IDS[0]!,
  };
}

const BUILDERS: Record<ItemMode, Builder> = {
  meaning: meaningQuestion,
  reverse: reverseQuestion,
  reading: readingQuestion,
};

/**
 * Three other items whose displayed text differs from the answer's and from
 * each other — two items can legitimately share a reading or a gloss, and a
 * repeated choice would make the question unanswerable.
 */
function pickDistractors(
  item: Item,
  pool: Item[],
  rng: Rng,
  display: (item: Item) => string,
): Item[] | undefined {
  const taken = new Set([display(item)]);
  const picked: Item[] = [];
  for (const other of shuffle(pool, rng)) {
    if (other.id === item.id) continue;
    const text = display(other);
    if (taken.has(text)) continue;
    taken.add(text);
    picked.push(other);
    if (picked.length === DISTRACTORS) return picked;
  }
  return undefined;
}
