import { createRouter, createWebHashHistory } from "vue-router";
import type { RouteLocationNormalized } from "vue-router";
import { getDeck } from "./api";
import { customDeck, wordTestUnits } from "./session";
import { isWordSet } from "./study/analytics";
import { availableModes, isMode } from "./study/modes";
import { CUSTOM_DECK_ID } from "./study/tags";
import { JLPT_LEVELS } from "./types";
import CustomView from "./views/CustomView.vue";
import DashboardView from "./views/DashboardView.vue";
import DeckView from "./views/DeckView.vue";
import HomeView from "./views/HomeView.vue";
import ResultView from "./views/ResultView.vue";
import SessionView from "./views/SessionView.vue";
import TestResultView from "./views/TestResultView.vue";
import TestView from "./views/TestView.vue";

/** A Custom session runs the same views as a deck, on the deck built in memory. */
const customProps = (route: RouteLocationNormalized) => ({
  id: CUSTOM_DECK_ID,
  mode: route.params.mode,
  custom: true,
});

/** A word test's set, and the level to take its words from (`?level=N4`; N5 by default). */
const wordTestProps = (route: RouteLocationNormalized) => ({
  set: route.params.set,
  level: JLPT_LEVELS.find((level) => level === route.query.level),
});

export const router = createRouter({
  // Hash history keeps deep links working on plain static hosting.
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/dashboard", name: "dashboard", component: DashboardView },
    { path: "/deck/:id", name: "deck", component: DeckView, props: true },
    // Before the mode routes, which would take "test" for a mode.
    { path: "/deck/:id/test", name: "test", component: TestView, props: true },
    { path: "/deck/:id/test/result", name: "test-result", component: TestResultView, props: true },
    { path: "/deck/:id/:mode", name: "session", component: SessionView, props: true },
    { path: "/deck/:id/:mode/result", name: "result", component: ResultView, props: true },
    { path: "/study", name: "custom", component: CustomView },
    // Word tests: up to 20 words from any decks. "these" is a list set in memory.
    { path: "/test/:set", name: "word-test", component: TestView, props: wordTestProps },
    { path: "/test/:set/result", name: "word-test-result", component: TestResultView, props: true },
    { path: "/study/:mode", name: "custom-session", component: SessionView, props: customProps },
    {
      path: "/study/:mode/result",
      name: "custom-result",
      component: ResultView,
      props: customProps,
    },
    { path: "/:pathMatch(.*)*", redirect: { name: "home" } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

/** Keeps hand-typed or stale URLs from rendering an empty session. */
router.beforeEach(async (to) => {
  if (to.name === "custom-session" || to.name === "custom-result") {
    // Nothing built (a refresh, or a typed URL): back to where one is built.
    const deck = customDeck.value;
    const mode = to.params.mode;
    const playable =
      deck && typeof mode === "string" && isMode(mode) && availableModes(deck).includes(mode);
    return playable ? true : { name: "custom" };
  }

  if (to.name === "word-test" || to.name === "word-test-result") {
    const set = to.params.set;
    if (typeof set !== "string") return { name: "dashboard" };
    if (set === "these") return wordTestUnits.value ? true : { name: "dashboard" };
    return isWordSet(set) ? true : { name: "dashboard" };
  }

  const id = to.params.id;
  if (typeof id !== "string") return true;

  const deck = await getDeck(id);
  if (!deck) return { name: "home" };

  const mode = to.params.mode;
  if (typeof mode !== "string") return true;
  if (!isMode(mode) || !availableModes(deck).includes(mode)) {
    return { name: "deck", params: { id } };
  }
  return true;
});
