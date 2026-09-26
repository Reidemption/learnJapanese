import { decks as staticDecks, getDeck as getStaticDeck } from "./content";
import {
  getItemStats,
  importAttempts,
  isDeckScore,
  loadAttemptLog,
  loadBaseline,
  loadScores,
  read,
  recordAttempt,
  saveScore,
  write,
  type AttemptMode,
  type AttemptRecord,
  type AttemptScope,
  type ImportResult,
  type ItemResult,
  type ItemStat,
  type LoggedAttempt,
} from "./progress";
import { BACKUP_VERSION, type Backup } from "./study/backup";
import { normalizeStat } from "./study/mastery";
import type { Deck, Jlpt } from "./types";

export type {
  AttemptMode,
  AttemptRecord,
  AttemptScope,
  ImportResult,
  LoggedAttempt,
} from "./progress";
export type { Backup } from "./study/backup";

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

/**
 * What a finished session reports. The API layer adds the `uid` and `at` (and
 * the `clientId`, in HTTP mode).
 */
export type NewAttempt = {
  deckId: string;
  mode: AttemptMode;
  correct: number;
  total: number;
  /** Whether furigana / hints were on at any point during the session. */
  kana: boolean;
  hints: boolean;
  /** A "Retry missed" run: recorded for mastery, but not a deck score. */
  retry?: boolean;
  /** "custom" for a Custom study session, whose `deckId` is empty. */
  scope?: AttemptScope;
  items: ItemResult[];
};

export interface StudyApi {
  listDecks(level?: Jlpt): Promise<DeckSummary[]>;
  getDeck(id: string): Promise<Deck | undefined>;
  postAttempt(attempt: LoggedAttempt): Promise<void>;
  getProgress(): Promise<Progress>;
  /** Finished sessions, oldest first, optionally from `since` (unix millis). */
  listAttempts(since?: number): Promise<AttemptRecord[]>;
  exportProgress(): Promise<Backup>;
  importProgress(backup: Backup): Promise<ImportResult>;
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

export function randomId(): string {
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
    if (isDeckScore(attempt)) saveScore(attempt.deckId, attempt.mode, attempt);
    recordAttempt(attempt);
  },

  async getProgress() {
    return { decks: loadScores(), items: getItemStats() };
  },

  async listAttempts(since) {
    return loadAttemptLog()
      .filter((attempt) => since === undefined || attempt.at >= since)
      .map(({ items: _items, ...record }) => record);
  },

  async exportProgress() {
    return {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      baseline: loadBaseline(),
      attempts: loadAttemptLog(),
    };
  },

  async importProgress(backup) {
    return importAttempts(backup.attempts, backup.baseline, (id) => !!getStaticDeck(id));
  },
};

type QueuedAttempt = LoggedAttempt & { clientId: string };

function readQueue(): QueuedAttempt[] {
  const queued = read<QueuedAttempt[]>(QUEUE_KEY, []);
  return Array.isArray(queued) ? queued : [];
}

/** Posts queued before sessions had a uid are told apart by their content. */
function queueKey(attempt: QueuedAttempt): string {
  return attempt.uid || JSON.stringify(attempt);
}

/** A non-2xx response, carrying its status. */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** A 4xx: the request itself is wrong, so sending it again won't help. */
function isRejected(error: unknown): boolean {
  return error instanceof HttpError && error.status >= 400 && error.status < 500;
}

/** Builds an HTTP implementation against `base`, e.g. `/api`. */
export function createHttpApi(base: string): StudyApi {
  const root = base.replace(/\/$/, "");

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${root}${path}`, init);
    if (!response.ok) {
      throw new HttpError(
        `${init?.method ?? "GET"} ${root}${path} failed: ${response.status}`,
        response.status,
      );
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

  /**
   * Retries anything a previous offline post left behind. Only one flush runs
   * at a time; a caller that arrives mid-flush waits for that one.
   */
  let flushing: Promise<void> | null = null;
  function flushQueue(): Promise<void> {
    flushing ??= drainQueue().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function drainQueue(): Promise<void> {
    const queued = readQueue();
    if (!queued.length) return;
    const done = new Set<string>();
    for (const attempt of queued) {
      try {
        await send(attempt);
        done.add(queueKey(attempt));
      } catch (error) {
        // The server refused it outright: resending can never succeed.
        if (isRejected(error)) done.add(queueKey(attempt));
      }
    }
    // Re-read, so a post queued while this flush ran is kept.
    write(QUEUE_KEY, readQueue().filter((attempt) => !done.has(queueKey(attempt))));
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
        // A rejected post would only be rejected again, so it is not kept.
        if (!isRejected(error)) write(QUEUE_KEY, [...readQueue(), payload]);
        throw error;
      }
    },

    async getProgress() {
      await flushQueue();
      const progress = await json<Progress>(`/progress?clientId=${encodeURIComponent(clientId())}`);
      return { decks: progress.decks ?? {}, items: normalizeItems(progress.items) };
    },

    async listAttempts(since) {
      await flushQueue();
      const query = since === undefined ? "" : `&since=${since}`;
      return json<AttemptRecord[]>(
        `/attempts?clientId=${encodeURIComponent(clientId())}${query}`,
      );
    },

    async exportProgress() {
      await flushQueue();
      return json<Backup>(`/export?clientId=${encodeURIComponent(clientId())}`);
    },

    async importProgress(backup) {
      return json<ImportResult>("/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId(), ...backup }),
      });
    },
  };
}

/** Fills in fields an older server leaves out, so views see one shape. */
function normalizeItems(raw: unknown): Record<string, ItemStat> {
  const items: Record<string, ItemStat> = {};
  if (!raw || typeof raw !== "object") return items;
  for (const [id, value] of Object.entries(raw)) {
    const stat = normalizeStat(value);
    if (stat) items[id] = stat;
  }
  return items;
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

/** Every deck in full, e.g. to gather words or kanji across decks. */
export async function allDecks(level?: Jlpt): Promise<Deck[]> {
  const summaries = await listDecks(level);
  const full = await Promise.all(summaries.map((summary) => getDeck(summary.id)));
  return full.filter((deck): deck is Deck => deck !== undefined);
}

export async function postAttempt(attempt: NewAttempt): Promise<void> {
  // One uid for both copies, so a retried post is recognised as the same session.
  const logged: LoggedAttempt = { ...attempt, uid: randomId(), at: Date.now() };
  // localStorage is written either way, so scores survive an offline session.
  await staticApi.postAttempt(logged);
  if (active === staticApi) return;
  try {
    await active.postAttempt(logged);
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

export async function listAttempts(since?: number): Promise<AttemptRecord[]> {
  try {
    return await active.listAttempts(since);
  } catch {
    return staticApi.listAttempts(since);
  }
}

/** The server holds the full history; the local copy is the fallback. */
export async function exportProgress(): Promise<Backup> {
  try {
    return await active.exportProgress();
  } catch {
    return staticApi.exportProgress();
  }
}

/**
 * Restores a backup into the local copy and, in HTTP mode, the server. Unlike
 * the other wrappers a server failure is thrown, so the person restoring
 * knows it did not reach the server.
 */
export async function importProgress(backup: Backup): Promise<ImportResult> {
  const local = await staticApi.importProgress(backup);
  if (active === staticApi) return local;
  return active.importProgress(backup);
}
