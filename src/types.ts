export type Jlpt = "N5" | "N4";
export type QuizKind = "meaning" | "reverse" | "reading" | "cloze";
export type CardMark = "known" | "learning";

export type RubySegment = {
  ja: string;
  reading?: string;
  en?: string;
  blank?: boolean;
};

export type Choice = {
  id: string;
  ja?: RubySegment[];
  en?: string;
};

export type Question = {
  id: string;
  jlpt: Jlpt;
  kind: QuizKind;
  promptEn?: string;
  promptJa: RubySegment[];
  choices: Choice[];
  correctId: string;
};

export type Category = {
  id: string;
  title: string;
  titleJa: string;
  questions: Question[];
};

export type QuizScore = {
  correct: number;
  total: number;
  at: number;
};

/** Deck content (content/decks/*.json) — see docs/PLAN.md. */

export const DECK_GROUPS = [
  "phrases",
  "vocab",
  "verbs",
  "numbers",
  "kanji",
  "grammar",
  "particles",
] as const;

export type DeckGroup = (typeof DECK_GROUPS)[number];

export const GROUP_LABELS: Record<DeckGroup, string> = {
  phrases: "Phrases",
  vocab: "Vocabulary",
  verbs: "Verbs",
  numbers: "Numbers",
  kanji: "Kanji",
  grammar: "Grammar",
  particles: "Particles",
};

/** A single thing to learn. `ja` uses the {base|reading|gloss} markup. */
export type Item = {
  id: string;
  ja: string;
  en: string;
  note?: string;
};

/** A hand-authored fill-in-the-blank sentence. `prompt` holds exactly one ___ */
export type DeckQuestion = {
  id: string;
  prompt: string;
  en?: string;
  answer: string;
  distractors: string[];
};

export type Deck = {
  id: string;
  level: Jlpt;
  group: DeckGroup;
  title: string;
  titleJa: string;
  order: number;
  items: Item[];
  questions?: DeckQuestion[];
};
