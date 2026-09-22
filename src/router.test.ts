import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App.vue";
import { decks } from "./content";
import { getScore, loadAttemptLog } from "./progress";
import { router } from "./router";
import { customDeck, customTags, lastResult, retryQueue } from "./session";
import { settings } from "./settings";
import { availableModes, buildQuestions } from "./study/modes";
import { seeded } from "./study/rng";

const deck = decks[0]!;
const mode = availableModes(deck)[0]!;

// Every test shares one router, so an App left mounted would keep reacting to
// the next test's navigation (and, say, take its retry queue).
const mounted: { unmount(): void }[] = [];

async function open(path: string) {
  router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

beforeEach(() => {
  localStorage.clear();
  settings.kana = true;
  settings.hints = true;
  // A real refresh reloads the module; tests share it, so reset it by hand.
  lastResult.value = null;
  retryQueue.value = null;
  customDeck.value = null;
  customTags.value = [];
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

  it("logs a Retry missed run as a retry, which is not a deck score", async () => {
    retryQueue.value = buildQuestions(deck, mode, seeded(1)).slice(0, 2);
    const wrapper = await open(`/deck/${deck.id}/${mode}`);
    for (let i = 0; i < 2; i++) {
      await wrapper.findAll(".choice")[0]!.trigger("click");
      await wrapper.find(".next-row .primary").trigger("click");
      await flushPromises();
    }
    expect(router.currentRoute.value.name).toBe("result");
    expect(loadAttemptLog()[0]).toMatchObject({ total: 2, retry: true });
    expect(getScore(deck.id, mode)).toBeUndefined();
  });

  it("opens the dashboard from the header link", async () => {
    const wrapper = await open("/");
    await wrapper.findAll(".nav-link").find((link) => link.text() === "Progress")!.trigger("click");
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

  it("opens Custom study from the header link and from its URL", async () => {
    const wrapper = await open("/");
    await wrapper.findAll(".nav-link").find((link) => link.text() === "Custom")!.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("custom");
    expect(wrapper.find(".tag-chips").exists()).toBe(true);

    const direct = await open("/study");
    expect(direct.find("h1").text()).toBe("Custom study");
  });

  it("sends a Custom session with nothing built back to the Custom page", async () => {
    await open("/study/meaning");
    expect(router.currentRoute.value.name).toBe("custom");
    await open("/study/meaning/result");
    expect(router.currentRoute.value.name).toBe("custom");
  });

  it("runs a Custom session and logs it without a deck", async () => {
    const wrapper = await open("/study");
    const verbs = wrapper.findAll(".tag-chip").find((chip) => chip.text().startsWith("Verbs"))!;
    await verbs.trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".item-list li")).toHaveLength(20);

    await wrapper.find(".level-row .primary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("custom-session");
    for (let i = 0; i < 30; i++) {
      const choice = wrapper.findAll(".choice")[0];
      if (!choice) break;
      await choice.trigger("click");
      await wrapper.find(".next-row .primary").trigger("click");
      await flushPromises();
    }

    expect(router.currentRoute.value.name).toBe("custom-result");
    expect(wrapper.find(".score h2").text()).toMatch(/^\d+ \/ 20$/);
    const [logged] = loadAttemptLog();
    expect(logged).toMatchObject({ deckId: "", scope: "custom", mode: "meaning", total: 20 });
    expect(logged?.items.every((item) => decks.some((d) => d.items.some((i) => i.id === item.itemId)))).toBe(true);

    // Back to the page it came from, with the same tags still picked.
    await wrapper.find(".next-row .primary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("custom");
    expect(wrapper.find(".tag-chip[aria-pressed='true']").text()).toMatch(/^Verbs/);
  });

  it("redirects unknown decks and modes", async () => {
    await open("/deck/not-a-deck");
    expect(router.currentRoute.value.name).toBe("home");

    await open(`/deck/${deck.id}/not-a-mode`);
    expect(router.currentRoute.value.name).toBe("deck");
  });
});
