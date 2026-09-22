import { createRouter, createWebHashHistory } from "vue-router";
import type { RouteLocationNormalized } from "vue-router";
import { getDeck } from "./api";
import { customDeck } from "./session";
import { availableModes, isMode } from "./study/modes";
import { CUSTOM_DECK_ID } from "./study/tags";
import CustomView from "./views/CustomView.vue";
import DashboardView from "./views/DashboardView.vue";
import DeckView from "./views/DeckView.vue";
import HomeView from "./views/HomeView.vue";
import ResultView from "./views/ResultView.vue";
import SessionView from "./views/SessionView.vue";

/** A Custom session runs the same views as a deck, on the deck built in memory. */
const customProps = (route: RouteLocationNormalized) => ({
  id: CUSTOM_DECK_ID,
  mode: route.params.mode,
  custom: true,
});

export const router = createRouter({
  // Hash history keeps deep links working on plain static hosting.
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/dashboard", name: "dashboard", component: DashboardView },
    { path: "/deck/:id", name: "deck", component: DeckView, props: true },
    { path: "/deck/:id/:mode", name: "session", component: SessionView, props: true },
    { path: "/deck/:id/:mode/result", name: "result", component: ResultView, props: true },
    { path: "/study", name: "custom", component: CustomView },
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
