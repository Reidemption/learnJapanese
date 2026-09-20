import type { Question } from "./types";
import type { Mode } from "./study/modes";

const SETTINGS_KEY = "lj.settings";
const SCORES_KEY = "lj.scores";
const ITEMS_KEY = "lj.items";

export type Settings = {
  kana: boolean;
  hints: boolean;
};

/** One deck+mode: the best run so far and the most recent one. */
export type ModeScore = {
  best: number;
  last: number;
  total: number;
  at: number;
};

/** Per item, across every mode — the seed of the weak-item review later on. */
export type ItemStat = {
  seen: number;
  correct: number;
};

export type ItemResult = {
  itemId: string;
  correct: boolean;
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: progress is a nicety, not worth crashing over.
  }
}

export function loadSettings(): Settings {
  const parsed = read<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    kana: parsed.kana !== false,
    hints: parsed.hints !== false,
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function scoreKey(deckId: string, mode: Mode): string {
  return `${deckId}:${mode}`;
}

function loadScores(): Record<string, ModeScore> {
  return read<Record<string, ModeScore>>(SCORES_KEY, {});
}

export function getScore(deckId: string, mode: Mode): ModeScore | undefined {
  return loadScores()[scoreKey(deckId, mode)];
}

/** Records a finished session, keeping the best run for the deck+mode. */
export function saveScore(
  deckId: string,
  mode: Mode,
  run: { correct: number; total: number },
): ModeScore {
  const scores = loadScores();
  const key = scoreKey(deckId, mode);
  const previous = scores[key];
  const score: ModeScore = {
    best: Math.max(run.correct, previous?.best ?? 0),
    last: run.correct,
    total: run.total,
    at: Date.now(),
  };
  scores[key] = score;
  write(SCORES_KEY, scores);
  return score;
}

/** The best score across every mode of a deck, as a ratio, or undefined if untouched. */
export function deckBest(deckId: string): number | undefined {
  const scores = loadScores();
  const ratios = Object.entries(scores)
    .filter(([key]) => key.startsWith(`${deckId}:`))
    .map(([, score]) => (score.total > 0 ? score.best / score.total : 0));
  return ratios.length ? Math.max(...ratios) : undefined;
}

export function getItemStats(): Record<string, ItemStat> {
  return read<Record<string, ItemStat>>(ITEMS_KEY, {});
}

export function recordItems(results: ItemResult[]): void {
  const stats = getItemStats();
  for (const result of results) {
    const stat = stats[result.itemId] ?? { seen: 0, correct: 0 };
    stat.seen += 1;
    if (result.correct) stat.correct += 1;
    stats[result.itemId] = stat;
  }
  write(ITEMS_KEY, stats);
}

/** Questions are ids of the form `<itemId>:<mode>`. */
export function itemIdOf(question: Question): string {
  const cut = question.id.lastIndexOf(":");
  return cut === -1 ? question.id : question.id.slice(0, cut);
}

export function correctChoice(question: Question) {
  const found = question.choices.find((c) => c.id === question.correctId);
  if (!found) throw new Error(`Missing correct choice for ${question.id}`);
  return found;
}

/** A cloze prompt with the blank filled in, for showing the answer afterwards. */
export function filledPrompt(question: Question) {
  const choice = correctChoice(question);
  const answer = choice.ja ?? [{ ja: choice.en ?? "" }];
  return question.promptJa.flatMap((part) => (part.blank ? answer : [part]));
}

// Re-exported so callers keep one import; the seedable version lives with the
// rest of the study logic.
export { shuffle } from "./study/rng";
