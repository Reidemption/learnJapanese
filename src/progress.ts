import type { Question } from "./types";
import { isMode, type Mode } from "./study/modes";
import { DEFAULT_FONT, isFontId, type FontId } from "./fonts";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./theme";
import { normalizeStat, rebuildStats, type Answer, type ItemStat } from "./study/mastery";

const SETTINGS_KEY = "lj.settings";
const SCORES_KEY = "lj.scores";
const ITEMS_KEY = "lj.items";
const BASE_KEY = "lj.itemsBase";
const ATTEMPTS_KEY = "lj.attempts";

/**
 * How many sessions the local log keeps. At ~25 answers a session that is
 * roughly 1 MB, well inside localStorage's quota; older sessions are folded
 * into the baseline so their answers still count.
 */
export const ATTEMPT_LOG_CAP = 1000;

export type { ItemStat } from "./study/mastery";

export type Settings = {
  kana: boolean;
  hints: boolean;
  font: FontId;
  theme: ThemeId;
  /** Show a stopwatch during tests. Just for fun: never stored with a result. */
  timer: boolean;
};

/** One deck+mode: the best run so far and the most recent one. */
export type ModeScore = {
  best: number;
  last: number;
  total: number;
  at: number;
};

/** One answer in a session: which unit, in which mode, and whether it was right. */
export type ItemResult = {
  itemId: string;
  mode: Mode;
  correct: boolean;
  /** "I don't know" in a test. Always `correct: false`. Absent = false. */
  skipped?: boolean;
};

/** A session's mode: one study mode, or "test", whose answers each carry their own. */
export type AttemptMode = Mode | "test";

export function isAttemptMode(value: string): value is AttemptMode {
  return value === "test" || isMode(value);
}

/** A finished session as listed back: no per-item answers. */
export type AttemptRecord = {
  /** Generated per session, so posting or importing it twice is harmless. */
  uid: string;
  deckId: string;
  mode: AttemptMode;
  /** Right answers out of all answers; for a test, units passed out of units tested. */
  correct: number;
  total: number;
  /** Whether furigana / hints were on at any point. Null for old sessions. */
  kana: boolean | null;
  hints: boolean | null;
  /** Unix millis. */
  at: number;
  /**
   * A "Retry missed" run over only the questions just missed. Its answers
   * count towards mastery, but it is not a score for the deck. Absent = false.
   */
  retry?: boolean;
  /**
   * "custom": a Custom study session over words from several decks. Its
   * `deckId` is empty and it is not a deck score. Absent = a deck session.
   */
  scope?: AttemptScope;
};

export type AttemptScope = "deck" | "custom";

/** Whether a session is a score for its deck: not a retry, not a Custom session. */
export function isDeckScore(attempt: Pick<AttemptRecord, "retry" | "scope">): boolean {
  return !attempt.retry && (attempt.scope ?? "deck") === "deck";
}

/** A finished session with every answer: what is posted, logged and backed up. */
export type LoggedAttempt = AttemptRecord & { items: ItemResult[] };

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown): void {
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
    font: isFontId(parsed.font) ? parsed.font : DEFAULT_FONT,
    theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_THEME,
    timer: parsed.timer === true,
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function scoreKey(deckId: string, mode: AttemptMode): string {
  return `${deckId}:${mode}`;
}

export function loadScores(): Record<string, ModeScore> {
  return read<Record<string, ModeScore>>(SCORES_KEY, {});
}

export function getScore(deckId: string, mode: AttemptMode): ModeScore | undefined {
  return loadScores()[scoreKey(deckId, mode)];
}

/**
 * Folds one run into a deck+mode score: the best run is kept, and "last" is
 * whichever run is newest, so importing old sessions never rewinds it.
 * `total` belongs to the best run, as on the server.
 */
export function mergeScore(
  previous: ModeScore | undefined,
  run: { correct: number; total: number; at: number },
): ModeScore {
  const newBest = !previous || run.correct > previous.best;
  const best = newBest ? run.correct : previous.best;
  const total = newBest ? run.total : previous.total;
  if (previous && previous.at > run.at) return { ...previous, best, total };
  return { best, last: run.correct, total, at: run.at };
}

/** Records a finished session, keeping the best run for the deck+mode. */
export function saveScore(
  deckId: string,
  mode: AttemptMode,
  run: { correct: number; total: number; at?: number },
): ModeScore {
  const scores = loadScores();
  const key = scoreKey(deckId, mode);
  const score = mergeScore(scores[key], { ...run, at: run.at ?? Date.now() });
  scores[key] = score;
  write(SCORES_KEY, scores);
  return score;
}

/**
 * The best score across every mode of a deck, as a ratio, or undefined if
 * untouched. Pure, so it also works on scores fetched from the server.
 */
export function bestRatioIn(
  scores: Record<string, { best: number; total?: number }>,
  deckId: string,
): number | undefined {
  const ratios = Object.entries(scores)
    .filter(([key]) => key.startsWith(`${deckId}:`))
    .map(([, score]) => (score.total && score.total > 0 ? score.best / score.total : 0));
  return ratios.length ? Math.max(...ratios) : undefined;
}

export function deckBest(deckId: string): number | undefined {
  return bestRatioIn(loadScores(), deckId);
}

function readStats(key: string): Record<string, ItemStat> {
  const raw = read<unknown>(key, {});
  const stats: Record<string, ItemStat> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return stats;
  for (const [id, value] of Object.entries(raw)) {
    const stat = normalizeStat(value);
    if (stat) stats[id] = stat;
  }
  return stats;
}

/** Per unit, across every mode. A cache of `rebuildStats(log, baseline)`. */
export function getItemStats(): Record<string, ItemStat> {
  return readStats(ITEMS_KEY);
}

function isLoggedAttempt(value: unknown): value is LoggedAttempt {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.uid === "string" &&
    typeof a.deckId === "string" &&
    typeof a.at === "number" &&
    Array.isArray(a.items)
  );
}

/** The local session log, oldest first. */
export function loadAttemptLog(): LoggedAttempt[] {
  const raw = read<unknown>(ATTEMPTS_KEY, []);
  return Array.isArray(raw) ? raw.filter(isLoggedAttempt) : [];
}

/**
 * Counts that are not in the log: everything recorded before the log existed
 * (the old `lj.items` totals) plus sessions folded out by the cap.
 */
export function loadBaseline(): Record<string, ItemStat> {
  let missing = true;
  try {
    missing = localStorage.getItem(BASE_KEY) === null;
  } catch {
    // Storage unavailable: treat it as empty below.
  }
  if (missing && loadAttemptLog().length === 0) {
    // First run with a log: the existing totals become the baseline.
    const legacy = getItemStats();
    write(BASE_KEY, legacy);
    return legacy;
  }
  return readStats(BASE_KEY);
}

function answersOf(attempts: LoggedAttempt[]): Answer[] {
  return attempts.flatMap((attempt) =>
    attempt.items.map((item) => ({ itemId: item.itemId, correct: item.correct, at: attempt.at })),
  );
}

/**
 * Writes a new log: sorts it, folds anything past the cap into the baseline,
 * and rebuilds the per-unit stats from the two.
 */
function saveLog(log: LoggedAttempt[], cap: number): void {
  let baseline = loadBaseline();
  const sorted = [...log].sort((a, b) => a.at - b.at);
  const overflow = Math.max(0, sorted.length - cap);
  if (overflow > 0) {
    baseline = rebuildStats(answersOf(sorted.slice(0, overflow)), baseline);
    write(BASE_KEY, baseline);
  }
  const kept = sorted.slice(overflow);
  write(ATTEMPTS_KEY, kept);
  write(ITEMS_KEY, rebuildStats(answersOf(kept), baseline));
}

/** Logs a finished session and updates the per-unit stats. */
export function recordAttempt(attempt: LoggedAttempt, cap = ATTEMPT_LOG_CAP): void {
  const log = loadAttemptLog();
  if (log.some((a) => a.uid === attempt.uid)) return;
  saveLog([...log, attempt], cap);
}

export type ImportResult = { imported: number; duplicates: number; skipped: number };

/**
 * Merges sessions (and a baseline) from a backup. Sessions already in the log
 * are skipped by uid, so importing the same file twice changes nothing.
 * Deck sessions for decks that no longer exist are skipped too; a Custom
 * session has no deck, so it is always kept.
 */
export function importAttempts(
  attempts: LoggedAttempt[],
  baseline: Record<string, ItemStat>,
  knownDeck: (id: string) => boolean,
  cap = ATTEMPT_LOG_CAP,
): ImportResult {
  const log = loadAttemptLog();
  const seen = new Set(log.map((a) => a.uid));
  const result: ImportResult = { imported: 0, duplicates: 0, skipped: 0 };
  const fresh: LoggedAttempt[] = [];
  for (const attempt of attempts) {
    if (seen.has(attempt.uid)) {
      result.duplicates += 1;
    } else if (attempt.scope !== "custom" && !knownDeck(attempt.deckId)) {
      result.skipped += 1;
    } else {
      seen.add(attempt.uid);
      fresh.push(attempt);
    }
  }

  // Baseline entries are only ever added, never overwritten, so a repeat
  // import is a no-op.
  const base = loadBaseline();
  let baseChanged = false;
  for (const [id, stat] of Object.entries(baseline)) {
    const normal = normalizeStat(stat);
    if (normal && !base[id]) {
      base[id] = normal;
      baseChanged = true;
    }
  }
  if (baseChanged) write(BASE_KEY, base);

  if (fresh.length || baseChanged) {
    const scores = loadScores();
    for (const attempt of fresh) {
      if (!isDeckScore(attempt)) continue;
      const key = scoreKey(attempt.deckId, attempt.mode);
      scores[key] = mergeScore(scores[key], attempt);
    }
    write(SCORES_KEY, scores);
    saveLog([...log, ...fresh], cap);
  }
  result.imported = fresh.length;
  return result;
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
