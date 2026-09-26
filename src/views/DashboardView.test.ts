import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routerKey } from "vue-router";
import DashboardView from "./DashboardView.vue";
import { setApi, staticApi, summarize, type AttemptRecord, type StudyApi } from "../api";
import { decksFor, getDeck } from "../content";
import { unitsOf } from "../study/analytics";
import { customDeck } from "../session";
import { emptyStat, type ItemStat } from "../study/mastery";
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

const push = vi.fn();

async function render() {
  const wrapper = mount(DashboardView, {
    global: {
      stubs: { RouterLink: RouterLinkStub },
      provide: { [routerKey as symbol]: { push } },
    },
  });
  await flushPromises();
  return wrapper;
}

const known = (at: number): ItemStat => ({
  ...emptyStat(),
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

  it("counts Custom sessions, which have no deck, in activity and the streak", async () => {
    const now = Date.now();
    const unit = unitsOf(first)[0]!;
    setApi(
      stubApi({ [unit.id]: { ...known(now), streak: 1, knownAt: null } }, [
        {
          uid: "c1",
          deckId: "",
          scope: "custom",
          mode: "meaning",
          correct: 15,
          total: 20,
          kana: false,
          hints: false,
          at: now,
        },
      ]),
    );
    const wrapper = await render();

    expect(wrapper.find(".heatmap").exists()).toBe(true);
    expect(wrapper.find(".dash-note").text()).toContain("1 session · 20 answers");
    expect(wrapper.find(".streak").text()).toContain("1 day in a row");
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

  describe("tests", () => {
    const tested = (passed: boolean, at = 1): ItemStat => ({
      ...emptyStat(),
      seen: 2,
      correct: passed ? 2 : 1,
      streak: passed ? 2 : 0,
      firstAt: at,
      lastAt: at,
      testedAt: at,
      testPassed: passed,
      masteredAt: passed ? at : null,
    });

    it("shows mastered as a fourth tier in the headline", async () => {
      const [a, b, c] = unitsOf(first);
      setApi(stubApi({ [a!.id]: tested(true), [b!.id]: known(1), [c!.id]: tested(false) }, []));
      const wrapper = await render();
      // Known or better counts as known in the headline; the legend splits them.
      expect(wrapper.find(".headline-count").text()).toContain(`2 of ${n5Total.toLocaleString()} N5 units known`);
      const legend = wrapper.find(".headline .mastery-legend").text();
      expect(legend).toContain("1 mastered");
      expect(legend).toContain("1 known");
      expect(legend).toContain("1 learning");
      expect(wrapper.find(".headline .stacked-bar rect.mastered").exists()).toBe(true);
    });

    it("lists struggling decks with Practise and Test again", async () => {
      const items: Record<string, ItemStat> = {};
      unitsOf(first).slice(0, 5).forEach((unit, i) => (items[unit.id] = tested(i >= 2)));
      setApi(stubApi(items, []));
      const wrapper = await render();

      const rows = wrapper.findAll(".struggling-row");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.text()).toContain(first.title);
      expect(rows[0]!.text()).toContain("60% passed · 2 of 5 tested words missed");
      const links = rows[0]!.findAllComponents(RouterLinkStub);
      expect(links.map((link: { props(name: "to"): unknown }) => link.props("to"))).toEqual([
        { name: "deck", params: { id: first.id } },
        { name: "test", params: { id: first.id } },
      ]);

      await rows[0]!.find("button").trigger("click");
      expect(push).toHaveBeenCalledWith({ name: "custom-session", params: expect.anything() });
      expect(customDeck.value?.items.map((item) => item.id)).toEqual(
        unitsOf(first).slice(0, 2).map((unit) => unit.id),
      );
    });

    it("offers word tests for the sets that have words", async () => {
      const [a, b, c] = unitsOf(first);
      setApi(stubApi({ [a!.id]: known(1), [b!.id]: known(1), [c!.id]: tested(false) }, [
        { uid: "u", deckId: first.id, mode: "meaning", correct: 1, total: 1, kana: true, hints: true, at: 1 },
      ]));
      const wrapper = await render();
      const tests = wrapper.findAll(".word-test-link");
      expect(tests.map((t) => t.text())).toEqual(["Test 2 ready words", "Test 1 missed word"]);
      expect(tests[0]!.findComponent(RouterLinkStub).props("to")).toEqual({
        name: "word-test",
        params: { set: "ready" },
        query: { level: "N5" },
      });
    });
  });
});
