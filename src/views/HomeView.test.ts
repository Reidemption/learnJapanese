import { mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import HomeView from "./HomeView.vue";
import { decks } from "../content";
import { saveScore } from "../progress";

function render() {
  return mount(HomeView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("HomeView", () => {
  it("renders every deck", () => {
    const wrapper = render();
    const rows = wrapper.findAll(".category-row");
    expect(rows).toHaveLength(decks.length);
    for (const deck of decks) {
      expect(wrapper.text()).toContain(deck.title);
      expect(wrapper.text()).toContain(deck.titleJa);
    }
  });

  it("groups decks by level", () => {
    const wrapper = render();
    const levels = [...new Set(decks.map((d) => d.level))];
    const headings = wrapper.findAll(".level-heading").map((h) => h.text());
    expect(headings).toHaveLength(levels.length);
    for (const level of levels) {
      expect(headings.some((h) => h.startsWith(level))).toBe(true);
    }
  });

  it("links each deck to its deck route", () => {
    const wrapper = render();
    const links = wrapper.findAllComponents(RouterLinkStub);
    const targets = links.map((l) => l.props("to") as { name: string; params: { id: string } });
    for (const deck of decks) {
      expect(targets).toContainEqual({ name: "deck", params: { id: deck.id } });
    }
  });

  it("shows the item count, and the best score once a deck has been studied", () => {
    const deck = decks[0]!;
    expect(render().text()).toContain(`${deck.items.length} items`);

    saveScore(deck.id, "meaning", { correct: 8, total: 10 });
    expect(render().text()).toContain("best 80%");
  });
});
