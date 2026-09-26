import { ref } from "vue";
import type { Deck, Question, Tag } from "./types";
import type { Mode } from "./study/modes";
import type { UnitResult } from "./study/test";

export type SessionResult = {
  deckId: string;
  mode: Mode;
  correct: number;
  total: number;
  missed: Question[];
};

/**
 * The last finished session, handed from the session screen to the result
 * screen. In memory only: on a page refresh the result screen sends you back
 * to the deck rather than inventing a score.
 */
export const lastResult = ref<SessionResult | null>(null);

/** Questions queued by "Retry missed", consumed by the next session. */
export const retryQueue = ref<Question[] | null>(null);

/**
 * The deck a Custom session plays. Any screen can start one by setting this
 * and opening `/study/:mode`. In memory only, like `lastResult`: after a
 * refresh the router sends you back to the Custom page.
 */
export const customDeck = ref<Deck | null>(null);

/** The tags picked on the Custom page, kept while you study and come back. */
export const customTags = ref<Tag[]>([]);

/** A finished test, handed to its result screen. In memory only, like `lastResult`. */
export type TestResult = {
  /** `deckId` for a deck test; the empty string for a word test, with `set`. */
  deckId: string;
  /** A word test's set: "ready", "missed", "weak" or "these". */
  set?: string;
  title: string;
  units: UnitResult[];
  questions: number;
  /** Only when the Timer was on. Shown once, never stored or sent. */
  elapsedMs: number | null;
};

export const lastTest = ref<TestResult | null>(null);

/** True while a test is on screen: the header locks its Kana and Hints toggles. */
export const testRunning = ref(false);

/**
 * The words a "these" word test asks, e.g. a deck test's misses. In memory
 * only: after a refresh the router sends you to the dashboard.
 */
export const wordTestUnits = ref<{ title: string; unitIds: string[] } | null>(null);

export function takeRetryQueue(): Question[] | null {
  const queued = retryQueue.value;
  retryQueue.value = null;
  return queued;
}
