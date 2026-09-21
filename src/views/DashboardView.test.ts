import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DashboardView from "./DashboardView.vue";
import { setApi, staticApi, summarize, type AttemptRecord, type StudyApi } from "../api";
import { decksFor, getDeck } from "../content";
import { unitsOf } from "../study/analytics";
import type { ItemStat } from "../study/mastery";
import type { Deck } from "../types";

const n5 = decksFor("N5");
const n5Total = n5.reduce((n, deck) => n + unitsOf(deck).length, 0);
const n5Groups = new Set(n5.map((deck) => deck.group)).size;
const first = n5[0]!;

function stubApi(items: Record<string, ItemStat>, attempts: AttemptRecord[]): StudyApi {
  return {
    ...staticApi,
    async listDecks(level) {
      return n5.filter((deck) => !level || deck.level === level).map(summarize);
    },
    async getDeck(id) {
      return getDeck(id);
    },
    async getProgress() {
      return { decks: {}, items };
    },
    async listAttempts() {
      return attempts;
    },
  };
}

const failingApi: StudyApi = {
  ...staticApi,
  listDecks: () => Promise.reject(new Error("down")),
  getDeck: () => Promise.reject(new Error("down")),
  getProgress: () => Promise.reject(new Error("down")),
  listAttempts: () => Promise.reject(new Error("down")),
};

async function render() {
  const wrapper = mount(DashboardView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return wrapper;
}

const known = (at: number): ItemStat => ({
  seen: 3,
  correct: 3,
  streak: 3,
  firstAt: at,
  lastAt: at,
  knownAt: at,
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  setApi(staticApi);
});

describe("DashboardView", () => {
  it("shows the headline numbers and one bar per group", async () => {
    const now = Date.now();
    const [a, b, c] = unitsOf(first);
    setApi(
      stubApi(
        {
          [a!.id]: known(now),
          [b!.id]: known(now),
          [c!.id]: { ...known(now), streak: 0 },
          // Weak: 1 of 4 right.
          [unitsOf(n5[1]!)[0]!.id]: { ...known(now), seen: 4, correct: 1, streak: 0, knownAt: null },
        },
        [
          {
            uid: "u1",
            deckId: first.id,
            mode: "meaning",
            correct: 9,
            total: 10,
            kana: true,
            hints: true,
            at: now,
          },
        ],
      ),
    );
    const wrapper = await render();

    expect(wrapper.find(".headline-count").text()).toContain(
      `2 of ${n5Total.toLocaleString()} N5 units known`,
    );
    expect(wrapper.find(".mastery-legend").text()).toContain("2 learning");
    expect(wrapper.find(".streak").text()).toContain("1 day in a row");
    expect(wrapper.findAll(".group-bar")).toHaveLength(n5Groups);
    expect(wrapper.findAll(".deck-tile")).toHaveLength(n5.length);
    expect(wrapper.find(".heatmap").exists()).toBe(true);
    expect(wrapper.find(".dash-note").text()).toContain("1 session");
    expect(wrapper.findAll(".weak-list li")).toHaveLength(1);
    expect(wrapper.find(".weak-meta").text()).toContain("25% right (1/4)");
    // Only one level has content, so there is no level switch.
    expect(wrapper.find(".level-switch").exists()).toBe(false);
  });

  it("starts from zero with everything new, not blank charts", async () => {
    setApi(stubApi({}, []));
    const wrapper = await render();

    expect(wrapper.find(".headline-count").text()).toContain(
      `0 of ${n5Total.toLocaleString()} N5 units known`,
    );
    expect(wrapper.find(".mastery-legend").text()).toContain(`${n5Total.toLocaleString()} new`);
    expect(wrapper.find(".headline .primary").text()).toBe(`Start with ${first.title}`);
    expect(wrapper.find(".heatmap").exists()).toBe(false);
    expect(wrapper.find(".line-chart").exists()).toBe(false);
    expect(wrapper.find(".weak-list").exists()).toBe(false);
    expect(wrapper.findAll(".group-bar")).toHaveLength(n5Groups);
  });

  it("sorts the deck grid by least learned", async () => {
    const last = n5[n5.length - 1]!;
    const items = Object.fromEntries(unitsOf(first).map((unit) => [unit.id, known(Date.now())]));
    setApi(stubApi(items, []));
    const wrapper = await render();
    const titles = () => wrapper.findAll(".deck-tile-title").map((t) => t.text());

    expect(titles()[0]).toBe(first.title);
    await wrapper.find(".section-head .ghost").trigger("click");
    expect(titles()[0]).not.toBe(first.title);
    expect(titles()[titles().length - 1]).toBe(first.title);
    expect(titles()).toContain(last.title);
  });

  it("offers a level switch once another level has decks", async () => {
    const n4: Deck = {
      ...first,
      id: "n4-test",
      level: "N4",
      items: first.items.slice(0, 5).map((item, i) => ({ ...item, id: `n4-test-${i}` })),
      questions: [],
    };
    setApi({
      ...stubApi({ "n4-test-0": known(Date.now()) }, []),
      async listDecks() {
        return [...n5, n4].map(summarize);
      },
      async getDeck(id) {
        return id === n4.id ? n4 : getDeck(id);
      },
    });
    const wrapper = await render();
    const buttons = wrapper.findAll(".level-switch button");
    expect(buttons.map((b) => b.text())).toEqual(["N5", "N4"]);
    expect(wrapper.find(".headline-count").text()).toContain("0 of");

    await buttons[1]!.trigger("click");
    expect(wrapper.find(".headline-count").text()).toContain("1 of 5 N4 units known");
    expect(wrapper.findAll(".deck-tile")).toHaveLength(1);
  });

  it("falls back to local data when the server is down", async () => {
    const item = first.items[0]!;
    for (let i = 0; i < 3; i++) {
      await staticApi.postAttempt({
        uid: `local-${i}`,
        deckId: first.id,
        mode: "meaning",
        correct: 1,
        total: 1,
        kana: true,
        hints: true,
        at: Date.now() - (3 - i) * 1000,
        items: [{ itemId: item.id, mode: "meaning", correct: true }],
      });
    }
    setApi(failingApi);
    const wrapper = await render();

    expect(wrapper.find(".headline-count").text()).toContain("1 of");
    expect(wrapper.find(".dash-note").text()).toContain("3 sessions");
  });
});
