import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientId,
  createHttpApi,
  currentApi,
  emptyProgress,
  exportProgress,
  getDeck,
  getProgress,
  importProgress,
  isHttpMode,
  listAttempts,
  listDecks,
  postAttempt,
  setApi,
  staticApi,
  summarize,
  type LoggedAttempt,
  type NewAttempt,
} from "./api";
import { decks } from "./content";
import { getItemStats, getScore } from "./progress";

const BASE = "http://test.local/api";
const http = createHttpApi(BASE);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const attempt: NewAttempt = {
  deckId: "n5-food",
  mode: "meaning",
  correct: 8,
  total: 10,
  kana: true,
  hints: false,
  items: [
    { itemId: "n5-food-1", mode: "meaning", correct: true },
    { itemId: "n5-food-2", mode: "meaning", correct: false },
  ],
};

const logged: LoggedAttempt = { ...attempt, uid: "session-1", at: 1_700_000_000_000 };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mode selection", () => {
  it("falls back to the bundled JSON when VITE_API_URL is unset", () => {
    // The test run never sets it, which is also what Phase 3's behaviour needs.
    expect(isHttpMode).toBe(false);
    expect(currentApi()).toBe(staticApi);
  });
});

describe("clientId", () => {
  it("generates once and then persists", () => {
    const first = clientId();
    expect(first).toMatch(/[0-9a-f-]{8,}/);
    expect(clientId()).toBe(first);
    localStorage.clear();
    expect(clientId()).not.toBe(first);
  });
});

describe("staticApi", () => {
  it("lists summaries without items, filtered by level", async () => {
    const all = await staticApi.listDecks();
    expect(all).toHaveLength(decks.length);
    expect(all[0]).not.toHaveProperty("items");
    expect(all[0]?.itemCount).toBe(decks[0]?.items.length);

    const n5 = await staticApi.listDecks("N5");
    expect(n5.every((d) => d.level === "N5")).toBe(true);
  });

  it("returns a full deck, or undefined for an unknown id", async () => {
    const deck = await staticApi.getDeck(decks[0]!.id);
    expect(deck?.items.length).toBeGreaterThan(0);
    expect(await staticApi.getDeck("nope")).toBeUndefined();
  });

  it("round-trips an attempt through localStorage", async () => {
    await staticApi.postAttempt(logged);
    const progress = await staticApi.getProgress();
    expect(progress.decks["n5-food:meaning"]).toMatchObject({ best: 8, last: 8, total: 10 });
    expect(progress.items["n5-food-1"]).toMatchObject({
      seen: 1,
      correct: 1,
      streak: 1,
      firstAt: logged.at,
    });
  });

  it("ignores the same session posted twice", async () => {
    await staticApi.postAttempt(logged);
    await staticApi.postAttempt(logged);
    expect((await staticApi.getProgress()).items["n5-food-1"]?.seen).toBe(1);
    expect(await staticApi.listAttempts()).toHaveLength(1);
  });

  it("lists sessions without their answers, filtered by since", async () => {
    await staticApi.postAttempt(logged);
    await staticApi.postAttempt({ ...logged, uid: "session-2", at: logged.at + 10 });
    const all = await staticApi.listAttempts();
    expect(all.map((a) => a.uid)).toEqual(["session-1", "session-2"]);
    expect(all[0]).not.toHaveProperty("items");
    expect(all[0]).toMatchObject({ kana: true, hints: false });
    expect((await staticApi.listAttempts(logged.at + 5)).map((a) => a.uid)).toEqual(["session-2"]);
  });

  it("exports and re-imports into empty storage with the same progress", async () => {
    // Totals from before the session log existed become the baseline.
    localStorage.setItem("lj.items", JSON.stringify({ "n5-food-9": { seen: 4, correct: 1 } }));
    await staticApi.postAttempt(logged);
    await staticApi.postAttempt({ ...logged, uid: "session-2", at: logged.at + 10 });
    const before = await staticApi.getProgress();
    const backup = await staticApi.exportProgress();
    expect(backup.attempts).toHaveLength(2);
    expect(backup.baseline["n5-food-9"]).toMatchObject({ seen: 4, correct: 1 });

    localStorage.clear();
    expect(await staticApi.importProgress(backup)).toEqual({
      imported: 2,
      duplicates: 0,
      skipped: 0,
    });
    expect(await staticApi.getProgress()).toEqual(before);

    // A second import of the same file changes nothing.
    expect(await staticApi.importProgress(backup)).toEqual({
      imported: 0,
      duplicates: 2,
      skipped: 0,
    });
    expect(await staticApi.getProgress()).toEqual(before);
  });

  it("skips imported sessions for decks that no longer exist", async () => {
    const backup = await staticApi.exportProgress();
    backup.attempts = [{ ...logged, deckId: "n5-gone" }];
    expect(await staticApi.importProgress(backup)).toMatchObject({ imported: 0, skipped: 1 });
  });
});

describe("httpApi", () => {
  it("GETs the deck list, with the level as a query parameter", async () => {
    const summary = summarize(decks[0]!);
    const fetchMock = mockFetch(jsonResponse([summary]));

    expect(await http.listDecks("N5")).toEqual([summary]);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/decks?level=N5`, undefined);
  });

  it("GETs one deck and maps 404 to undefined", async () => {
    const deck = decks[0]!;
    const fetchMock = mockFetch(jsonResponse(deck), jsonResponse(null, 404));

    expect(await http.getDeck(deck.id)).toEqual(deck);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/decks/${deck.id}`);
    expect(await http.getDeck("missing")).toBeUndefined();
  });

  it("POSTs an attempt with the clientId in the payload", async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    await http.postAttempt(logged);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/attempts`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ clientId: clientId(), ...logged });
  });

  it("GETs progress for this client, filling in fields an old server omits", async () => {
    const body = {
      decks: { "n5-food:meaning": { best: 8, last: 8, at: 1 } },
      items: { "n5-food-1": { seen: 2, correct: 1 } },
    };
    const fetchMock = mockFetch(jsonResponse(body));

    expect(await http.getProgress()).toEqual({
      decks: body.decks,
      items: {
        "n5-food-1": { seen: 2, correct: 1, streak: 0, firstAt: null, lastAt: null, knownAt: null },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/progress?clientId=${clientId()}`,
      undefined,
    );
  });

  it("GETs attempts, with since as a query parameter", async () => {
    const fetchMock = mockFetch(jsonResponse([]), jsonResponse([]));
    await http.listAttempts();
    await http.listAttempts(1234);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/attempts?clientId=${clientId()}`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${BASE}/attempts?clientId=${clientId()}&since=1234`,
    );
  });

  it("GETs an export and POSTs an import for this client", async () => {
    const backup = await staticApi.exportProgress();
    const fetchMock = mockFetch(
      jsonResponse(backup),
      jsonResponse({ imported: 0, duplicates: 0, skipped: 0 }),
    );
    expect(await http.exportProgress()).toEqual(backup);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/export?clientId=${clientId()}`);

    await http.importProgress(backup);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${BASE}/import`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ clientId: clientId(), ...backup });
  });

  it("surfaces a server error instead of returning junk", async () => {
    mockFetch(jsonResponse({ error: "boom" }, 500));
    await expect(http.getProgress()).rejects.toThrow(/500/);

    mockFetch(jsonResponse(null, 500));
    await expect(http.listDecks()).rejects.toThrow(/500/);
  });

  it("surfaces a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(http.getDeck("n5-food")).rejects.toThrow(/Failed to fetch/);
  });

  it("queues a failed attempt and retries it on the next call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(http.postAttempt(logged)).rejects.toThrow(/offline/);
    expect(JSON.parse(localStorage.getItem("lj.queue") ?? "[]")).toHaveLength(1);

    const fetchMock = mockFetch(jsonResponse({}), jsonResponse({ decks: {}, items: {} }));
    await http.getProgress();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/attempts`);
    expect(JSON.parse(localStorage.getItem("lj.queue") ?? "[]")).toHaveLength(0);
  });
});

describe("the wrappers the views use", () => {
  afterEach(() => {
    setApi(staticApi);
  });

  it("keeps a local copy of every attempt", async () => {
    await postAttempt(attempt);
    expect(getScore("n5-food", "meaning")).toMatchObject({ best: 8, total: 10 });
    expect(getItemStats()["n5-food-2"]).toMatchObject({ seen: 1, correct: 0, streak: 0 });
  });

  it("gives the local and server copies the same uid", async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    setApi(http);
    await postAttempt(attempt);
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const [local] = await staticApi.listAttempts();
    expect(sent.uid).toBe(local?.uid);
    expect(sent.at).toBe(local?.at);
    expect(sent).toMatchObject({ kana: true, hints: false });
  });

  it("restores into the local copy and the server, and reports a server failure", async () => {
    const backup = await staticApi.exportProgress();
    backup.attempts = [logged];
    setApi(http);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(importProgress(backup)).rejects.toThrow(/offline/);
    // The local copy still got it.
    expect(await staticApi.listAttempts()).toHaveLength(1);
  });

  it("degrades to the bundled content when the backend is down", async () => {
    setApi(http);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(listDecks()).resolves.toHaveLength(decks.length);
    await expect(getDeck(decks[0]!.id)).resolves.toMatchObject({ id: decks[0]!.id });
    await expect(getProgress()).resolves.toEqual(emptyProgress());
    await expect(listAttempts()).resolves.toEqual([]);
    await expect(exportProgress()).resolves.toMatchObject({ version: 1, attempts: [] });
  });

  it("still records locally, and queues the post, when the backend is down", async () => {
    setApi(http);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(postAttempt(attempt)).resolves.toBeUndefined();
    expect(getScore("n5-food", "meaning")).toMatchObject({ best: 8 });
    expect(JSON.parse(localStorage.getItem("lj.queue") ?? "[]")).toHaveLength(1);
  });
});
