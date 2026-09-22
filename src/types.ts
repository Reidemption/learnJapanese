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

/**
 * Tags let a Custom study session gather words across decks (see
 * docs/PLAN-tags.md). A word's tags are its deck's `tags` plus its own.
 * "type" tags say what kind of word it is; "theme" tags what it's about.
 */
export const TAG_FACETS = ["type", "theme"] as const;

export type TagFacet = (typeof TAG_FACETS)[number];

export type TagInfo = { facet: TagFacet; label: string; labelJa: string };

export const TAGS = {
  noun: { facet: "type", label: "Nouns", labelJa: "名詞" },
  number: { facet: "type", label: "Numbers", labelJa: "数字" },
  counter: { facet: "type", label: "Counters", labelJa: "助数詞" },
  verb: { facet: "type", label: "Verbs", labelJa: "動詞" },
  "u-verb": { facet: "type", label: "U-verbs", labelJa: "五段動詞" },
  "ru-verb": { facet: "type", label: "Ru-verbs", labelJa: "一段動詞" },
  "irregular-verb": { facet: "type", label: "Irregular verbs", labelJa: "不規則動詞" },
  "i-adj": { facet: "type", label: "い-adjectives", labelJa: "い形容詞" },
  "na-adj": { facet: "type", label: "な-adjectives", labelJa: "な形容詞" },
  adverb: { facet: "type", label: "Adverbs", labelJa: "副詞" },
  conjunction: { facet: "type", label: "Conjunctions", labelJa: "接続詞" },
  "question-word": { facet: "type", label: "Question words", labelJa: "疑問詞" },
  expression: { facet: "type", label: "Expressions", labelJa: "表現" },
  time: { facet: "theme", label: "Time", labelJa: "時間" },
  place: { facet: "theme", label: "Places", labelJa: "場所" },
  people: { facet: "theme", label: "People", labelJa: "人" },
  food: { facet: "theme", label: "Food & drink", labelJa: "食べ物" },
  nature: { facet: "theme", label: "Nature & weather", labelJa: "自然" },
  body: { facet: "theme", label: "Body & health", labelJa: "体" },
  home: { facet: "theme", label: "Home", labelJa: "家" },
  school: { facet: "theme", label: "School & study", labelJa: "学校" },
  transport: { facet: "theme", label: "Getting around", labelJa: "交通" },
  shopping: { facet: "theme", label: "Shopping & money", labelJa: "買い物" },
} as const satisfies Record<string, TagInfo>;

export type Tag = keyof typeof TAGS;

/** Verb classes: a word with one of these is always a `verb` too. */
export const VERB_CLASSES = ["u-verb", "ru-verb", "irregular-verb"] as const satisfies readonly Tag[];

/**
 * Groups whose items aren't words: grammar forms, particles and single kanji.
 * They carry no tags, so Custom study never mixes them in with vocabulary.
 */
export const UNTAGGED_GROUPS: readonly DeckGroup[] = ["kanji", "grammar", "particles"];

/** A single thing to learn. `ja` uses the {base|reading|gloss} markup. */
export type Item = {
  id: string;
  ja: string;
  en: string;
  note?: string;
  /** Added to the deck's own `tags`, never repeating one of them. */
  tags?: Tag[];
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
  /** Tags every item in the deck has. */
  tags?: Tag[];
  items: Item[];
  questions?: DeckQuestion[];
};
