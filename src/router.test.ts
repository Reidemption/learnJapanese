import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App.vue";
import { decks } from "./content";
import { router } from "./router";
import { lastResult, retryQueue } from "./session";
import { availableModes } from "./study/modes";

const deck = decks[0]!;
const mode = availableModes(deck)[0]!;

async function open(path: string) {
  router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  // A real refresh reloads the module; tests share it, so reset it by hand.
  lastResult.value = null;
  retryQueue.value = null;
});

describe("routing", () => {
  it("starts on the deck list", async () => {
    const wrapper = await open("/");
    expect(wrapper.findAll(".category-row").length).toBe(decks.length);
  });

  it("opens a deck straight from its URL, as a refresh would", async () => {
    const wrapper = await open(`/deck/${deck.id}`);
    expect(wrapper.text()).toContain(deck.title);
    expect(wrapper.findAll(".level-row").length).toBe(availableModes(deck).length);
  });

  it("runs a session to its score screen", async () => {
    const wrapper = await open(`/deck/${deck.id}/${mode}`);
    expect(wrapper.findAll(".choice").length).toBe(4);

    // Answer every question, right or wrong, until the session emits its score.
    for (let i = 0; i < deck.items.length + 5; i++) {
      const choice = wrapper.findAll(".choice")[0];
      if (!choice) break;
      await choice.trigger("click");
      await wrapper.find(".next-row .primary").trigger("click");
      await flushPromises();
    }

    expect(router.currentRoute.value.name).toBe("result");
    expect(wrapper.find(".score h2").text()).toMatch(/^\d+ \/ \d+$/);
  });

  it("sends a refreshed result page back to the deck instead of faking a score", async () => {
    const wrapper = await open(`/deck/${deck.id}/${mode}/result`);
    expect(wrapper.text()).toContain("No score to show");
  });

  it("redirects unknown decks and modes", async () => {
    await open("/deck/not-a-deck");
    expect(router.currentRoute.value.name).toBe("home");

    await open(`/deck/${deck.id}/not-a-mode`);
    expect(router.currentRoute.value.name).toBe("deck");
  });
});
