import { decks as staticDecks, getDeck as getStaticDeck } from "./content";
import {
  getItemStats,
  loadScores,
  read,
  recordItems,
  saveScore,
  write,
  type ItemResult,
  type ItemStat,
} from "./progress";
import type { Mode } from "./study/modes";
import type { Deck, Jlpt } from "./types";

const CLIENT_KEY = "lj.clientId";
const QUEUE_KEY = "lj.queue";

/** A deck without its items — what `GET /api/decks` returns. */
export type DeckSummary = {
  id: string;
  level: Jlpt;
  group: Deck["group"];
  title: string;
  titleJa: string;
  order: number;
  /** Absent when the server sends a summary without one. */
  itemCount?: number;
};

/** One deck+mode score. `total` is optional: the server may not send it. */
export type ScoreEntry = {
  best: number;
  last: number;
  total?: number;
  at: number;
};

export type Progress = {
  decks: Record<string, ScoreEntry>;
  items: Record<string, ItemStat>;
};

/** What a finished session reports. The `clientId` is added by the API layer. */
export type Attempt = {
  deckId: string;
  mode: Mode;
  correct: number;
  total: number;
  items: ItemResult[];
};

export interface StudyApi {
  listDecks(level?: Jlpt): Promise<DeckSummary[]>;
  getDeck(id: string): Promise<Deck | undefined>;
  postAttempt(attempt: Attempt): Promise<void>;
  getProgress(): Promise<Progress>;
}

/** The key both implementations use for a deck+mode score. */
export { scoreKey as scoreKeyOf } from "./progress";

export function emptyProgress(): Progress {
  return { decks: {}, items: {} };
}

export function summarize(deck: Deck): DeckSummary {
  return {
    id: deck.id,
    level: deck.level,
    group: deck.group,
    title: deck.title,
    titleJa: deck.titleJa,
    order: deck.order,
    itemCount: deck.items.length,
  };
}

/** An anonymous id for progress, generated once and kept in localStorage. */
export function clientId(): string {
  const existing = read<string>(CLIENT_KEY, "");
  if (typeof existing === "string" && existing) return existing;
  const fresh = randomId();
  write(CLIENT_KEY, fresh);
  return fresh;
}

function randomId(): string {
  const webCrypto: Crypto | undefined = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  // jsdom and older browsers: good enough for an anonymous key.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

/** The JSON + localStorage implementation, used when `VITE_API_URL` is unset. */
export const staticApi: StudyApi = {
  async listDecks(level) {
    const all = staticDecks.filter((deck) => !level || deck.level === level);
    return all.map(summarize);
  },

  async getDeck(id) {
    return getStaticDeck(id);
  },

  async postAttempt(attempt) {
    saveScore(attempt.deckId, attempt.mode, attempt);
    recordItems(attempt.items);
  },

  async getProgress() {
    return { decks: loadScores(), items: getItemStats() };
  },
};

type QueuedAttempt = Attempt & { clientId: string };

function readQueue(): QueuedAttempt[] {
  const queued = read<QueuedAttempt[]>(QUEUE_KEY, []);
  return Array.isArray(queued) ? queued : [];
}

/** Builds an HTTP implementation against `base`, e.g. `/api`. */
export function createHttpApi(base: string): StudyApi {
  const root = base.replace(/\/$/, "");

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${root}${path}`, init);
    if (!response.ok) {
      throw new Error(`${init?.method ?? "GET"} ${root}${path} failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function send(attempt: QueuedAttempt): Promise<void> {
    await json<unknown>("/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt),
    });
  }

  /** Retries anything a previous offline post left behind. */
  async function flushQueue(): Promise<void> {
    const queued = readQueue();
    if (!queued.length) return;
    const failed: QueuedAttempt[] = [];
    for (const attempt of queued) {
      try {
        await send(attempt);
      } catch {
        failed.push(attempt);
      }
    }
    write(QUEUE_KEY, failed);
  }

  return {
    async listDecks(level) {
      const query = level ? `?level=${encodeURIComponent(level)}` : "";
      return json<DeckSummary[]>(`/decks${query}`);
    },

    async getDeck(id) {
      const response = await fetch(`${root}/decks/${encodeURIComponent(id)}`);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`GET ${root}/decks/${id} failed: ${response.status}`);
      return (await response.json()) as Deck;
    },

    async postAttempt(attempt) {
      const payload: QueuedAttempt = { clientId: clientId(), ...attempt };
      await flushQueue();
      try {
        await send(payload);
      } catch (error) {
        // Offline: keep it for the next call rather than losing the session.
        write(QUEUE_KEY, [...readQueue(), payload]);
        throw error;
      }
    },

    async getProgress() {
      await flushQueue();
      return json<Progress>(`/progress?clientId=${encodeURIComponent(clientId())}`);
    },
  };
}

const apiUrl = import.meta.env.VITE_API_URL;

export const httpApi: StudyApi = createHttpApi(apiUrl || "/api");

/** Unset `VITE_API_URL` means the app runs standalone off the bundled JSON. */
export const isHttpMode = Boolean(apiUrl);

let active: StudyApi = isHttpMode ? httpApi : staticApi;

export function currentApi(): StudyApi {
  return active;
}

/** Test seam: swaps the implementation the wrappers below use. */
export function setApi(next: StudyApi): void {
  active = next;
  deckCache.clear();
}

// Views call the wrappers below rather than an implementation directly: a
// backend that is down should degrade to the local copy, never blank the UI.

const deckCache = new Map<string, Deck | undefined>();

export async function listDecks(level?: Jlpt): Promise<DeckSummary[]> {
  try {
    return await active.listDecks(level);
  } catch {
    return staticApi.listDecks(level);
  }
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  if (deckCache.has(id)) return deckCache.get(id);
  let deck: Deck | undefined;
  try {
    deck = await active.getDeck(id);
  } catch {
    deck = await staticApi.getDeck(id);
  }
  deckCache.set(id, deck);
  return deck;
}

export async function postAttempt(attempt: Attempt): Promise<void> {
  // localStorage is written either way, so scores survive an offline session.
  await staticApi.postAttempt(attempt);
  if (active === staticApi) return;
  try {
    await active.postAttempt(attempt);
  } catch {
    // Already queued for a retry by `createHttpApi`.
  }
}

export async function getProgress(): Promise<Progress> {
  try {
    return await active.getProgress();
  } catch {
    return staticApi.getProgress();
  }
}
