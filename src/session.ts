import { ref } from "vue";
import type { Question } from "./types";
import type { Mode } from "./study/modes";

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

export function takeRetryQueue(): Question[] | null {
  const queued = retryQueue.value;
  retryQueue.value = null;
  return queued;
}
