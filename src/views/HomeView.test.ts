import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import HomeView from "./HomeView.vue";
import { decks } from "../content";
import { saveScore } from "../progress";

// The deck list and progress now arrive through the async API layer, so the
// mount has to settle before anything is on screen.
async function render() {
  const wrapper = mount(HomeView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
});

describe("HomeView", () => {
  it("renders every deck", async () => {
    const wrapper = await render();
    const rows = wrapper.findAll(".category-row");
    expect(rows).toHaveLength(decks.length);
    for (const deck of decks) {
      expect(wrapper.text()).toContain(deck.title);
      expect(wrapper.text()).toContain(deck.titleJa);
    }
  });

  it("groups decks by level", async () => {
    const wrapper = await render();
    const levels = [...new Set(decks.map((d) => d.level))];
    const headings = wrapper.findAll(".level-heading").map((h) => h.text());
    expect(headings).toHaveLength(levels.length);
    for (const level of levels) {
      expect(headings.some((h) => h.startsWith(level))).toBe(true);
    }
  });

  it("links each deck to its deck route", async () => {
    const wrapper = await render();
    const links = wrapper.findAllComponents(RouterLinkStub);
    const targets = links.map((l) => l.props("to") as { name: string; params: { id: string } });
    for (const deck of decks) {
      expect(targets).toContainEqual({ name: "deck", params: { id: deck.id } });
    }
  });

  it("shows the item count, and the best score once a deck has been studied", async () => {
    const deck = decks[0]!;
    expect((await render()).text()).toContain(`${deck.items.length} items`);

    saveScore(deck.id, "meaning", { correct: 8, total: 10 });
    expect((await render()).text()).toContain("best 80%");
  });
});
