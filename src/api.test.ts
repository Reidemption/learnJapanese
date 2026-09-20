import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientId,
  createHttpApi,
  currentApi,
  emptyProgress,
  getDeck,
  getProgress,
  isHttpMode,
  listDecks,
  postAttempt,
  setApi,
  staticApi,
  summarize,
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

const attempt = {
  deckId: "n5-food",
  mode: "meaning" as const,
  correct: 8,
  total: 10,
  items: [
    { itemId: "n5-food-1", correct: true },
    { itemId: "n5-food-2", correct: false },
  ],
};

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
    await staticApi.postAttempt(attempt);
    const progress = await staticApi.getProgress();
    expect(progress.decks["n5-food:meaning"]).toMatchObject({ best: 8, last: 8, total: 10 });
    expect(progress.items["n5-food-1"]).toEqual({ seen: 1, correct: 1 });
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
    await http.postAttempt(attempt);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/attempts`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ clientId: clientId(), ...attempt });
  });

  it("GETs progress for this client", async () => {
    const body = { decks: { "n5-food:meaning": { best: 8, last: 8, at: 1 } }, items: {} };
    const fetchMock = mockFetch(jsonResponse(body));

    expect(await http.getProgress()).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/progress?clientId=${clientId()}`,
      undefined,
    );
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
    await expect(http.postAttempt(attempt)).rejects.toThrow(/offline/);
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
    expect(getItemStats()["n5-food-2"]).toEqual({ seen: 1, correct: 0 });
  });

  it("degrades to the bundled content when the backend is down", async () => {
    setApi(http);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(listDecks()).resolves.toHaveLength(decks.length);
    await expect(getDeck(decks[0]!.id)).resolves.toMatchObject({ id: decks[0]!.id });
    await expect(getProgress()).resolves.toEqual(emptyProgress());
  });

  it("still records locally, and queues the post, when the backend is down", async () => {
    setApi(http);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(postAttempt(attempt)).resolves.toBeUndefined();
    expect(getScore("n5-food", "meaning")).toMatchObject({ best: 8 });
    expect(JSON.parse(localStorage.getItem("lj.queue") ?? "[]")).toHaveLength(1);
  });
});
