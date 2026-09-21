import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App.vue";
import { decks } from "./content";
import { loadAttemptLog } from "./progress";
import { router } from "./router";
import { lastResult, retryQueue } from "./session";
import { settings } from "./settings";
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
  settings.kana = true;
  settings.hints = true;
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

    // The session is logged with its answers and whether help was on.
    const [logged] = loadAttemptLog();
    expect(logged).toMatchObject({ deckId: deck.id, mode, kana: mode !== "reading", hints: true });
    expect(logged?.items.every((item) => item.mode === mode)).toBe(true);
  });

  it("counts kana as used if it is switched on at any point in a session", async () => {
    settings.kana = false;
    settings.hints = false;
    const wrapper = await open(`/deck/${deck.id}/meaning`);
    settings.kana = true;
    await flushPromises();
    settings.kana = false;
    for (let i = 0; i < deck.items.length + 5; i++) {
      const choice = wrapper.findAll(".choice")[0];
      if (!choice) break;
      await choice.trigger("click");
      await wrapper.find(".next-row .primary").trigger("click");
      await flushPromises();
    }
    expect(loadAttemptLog()[0]).toMatchObject({ kana: true, hints: false });
  });

  it("opens the dashboard from the header link", async () => {
    const wrapper = await open("/");
    await wrapper.find(".nav-link").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("dashboard");
    expect(wrapper.find(".headline-count").text()).toMatch(/^0 of [\d,]+ N5 units known/);
  });

  it("opens the dashboard straight from its URL", async () => {
    const wrapper = await open("/dashboard");
    expect(wrapper.find(".headline-count").exists()).toBe(true);
    expect(wrapper.findAll(".deck-tile").length).toBe(decks.filter((d) => d.level === "N5").length);
  });

  it("shows how much of a deck is known above its modes", async () => {
    const wrapper = await open(`/deck/${deck.id}`);
    const units = deck.items.length + (deck.questions?.length ?? 0);
    expect(wrapper.find(".deck-mastery .mastery-legend").text()).toContain(`${units} new`);
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
