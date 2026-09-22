import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomView from "./CustomView.vue";
import { setApi, staticApi, summarize, type StudyApi } from "../api";
import { decks, decksFor, getDeck } from "../content";
import { customDeck, customTags } from "../session";
import type { ItemStat } from "../study/mastery";
import { matchingUnits } from "../study/tags";

const push = vi.fn();
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push }),
}));

const n5 = decksFor("N5");
const verbCount = matchingUnits(decks, "N5", ["verb"]).length;

function stubApi(items: Record<string, ItemStat>): StudyApi {
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
  };
}

async function render() {
  const wrapper = mount(CustomView);
  await flushPromises();
  return wrapper;
}

function chip(wrapper: Awaited<ReturnType<typeof render>>, label: string) {
  const found = wrapper.findAll(".tag-chip").find((c) => c.text().startsWith(label));
  if (!found) throw new Error(`no chip ${label}`);
  return found;
}

beforeEach(() => {
  localStorage.clear();
  customDeck.value = null;
  customTags.value = [];
  push.mockClear();
});

afterEach(() => {
  setApi(staticApi);
});

describe("CustomView", () => {
  it("shows every tag with words, grouped, and asks for a pick", async () => {
    setApi(stubApi({}));
    const wrapper = await render();
    expect(wrapper.findAll(".tag-group .group-heading").map((h) => h.text())).toEqual([
      "Word type",
      "Theme",
    ]);
    expect(chip(wrapper, "Verbs").text()).toBe(`Verbs ${verbCount}`);
    expect(wrapper.text()).toContain("Pick one or more tags");
    expect(wrapper.find(".level-row").exists()).toBe(false);
  });

  it("builds a 20-word deck as tags are picked, and narrows across groups", async () => {
    setApi(stubApi({}));
    const wrapper = await render();

    await chip(wrapper, "Verbs").trigger("click");
    expect(chip(wrapper, "Verbs").attributes("aria-pressed")).toBe("true");
    expect(wrapper.find(".custom-summary p").text()).toBe(`${verbCount} words match · this deck takes 20`);
    expect(wrapper.findAll(".item-list li")).toHaveLength(20);
    expect(wrapper.findAll(".level-row h2").map((h) => h.text())).toEqual([
      "Meaning",
      "Recall",
      "Reading",
    ]);

    const foodVerbs = matchingUnits(decks, "N5", ["verb", "food"]).length;
    await chip(wrapper, "Food & drink").trigger("click");
    expect(wrapper.find(".custom-summary h2").text()).toBe("Verbs · Food & drink");
    expect(wrapper.findAll(".item-list li")).toHaveLength(foodVerbs);
    expect(wrapper.find(".custom-summary .ghost").exists()).toBe(false);
  });

  it("says so when nothing matches", async () => {
    setApi(stubApi({}));
    const wrapper = await render();
    await chip(wrapper, "Conjunctions").trigger("click");
    await chip(wrapper, "Food & drink").trigger("click");
    expect(wrapper.text()).toContain("No N5 words match Conjunctions + Food & drink.");
  });

  it("puts weak words first and marks each word's mastery", async () => {
    const [weakVerb] = matchingUnits(decks, "N5", ["verb"]).slice(-1);
    const weak: ItemStat = { seen: 5, correct: 1, streak: 0, firstAt: 1, lastAt: 2, knownAt: null };
    setApi(stubApi({ [weakVerb!.id]: weak }));
    const wrapper = await render();
    await chip(wrapper, "Verbs").trigger("click");

    const first = wrapper.findAll(".item-list li")[0]!;
    expect(first.text()).toContain(weakVerb!.en);
    expect(first.find(".swatch").classes()).toContain("learning");
    expect(wrapper.find(".mastery-legend").text()).toContain("19 new");
  });

  it("gives a different set on New set", async () => {
    setApi(stubApi({}));
    const wrapper = await render();
    await chip(wrapper, "Verbs").trigger("click");
    const words = () => wrapper.findAll(".item-list li").map((li) => li.text());
    const before = words();

    await wrapper.find(".custom-summary .ghost").trigger("click");
    const after = words();
    expect(after).toHaveLength(20);
    expect(after.filter((word) => before.includes(word))).toEqual([]);
  });

  it("starts a session on the deck it shows", async () => {
    setApi(stubApi({}));
    const wrapper = await render();
    await chip(wrapper, "Verbs").trigger("click");
    const shown = wrapper.findAll(".item-list li").length;

    await wrapper.findAll(".level-row .primary")[1]!.trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "custom-session", params: { mode: "reverse" } });
    expect(customDeck.value?.title).toBe("Verbs");
    expect(customDeck.value?.items).toHaveLength(shown);
  });
});
