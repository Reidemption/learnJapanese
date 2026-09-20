import { createRouter, createWebHashHistory } from "vue-router";
import { getDeck } from "./content";
import { availableModes, isMode } from "./study/modes";
import DeckView from "./views/DeckView.vue";
import HomeView from "./views/HomeView.vue";
import ResultView from "./views/ResultView.vue";
import SessionView from "./views/SessionView.vue";

export const router = createRouter({
  // Hash history keeps deep links working on plain static hosting.
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/deck/:id", name: "deck", component: DeckView, props: true },
    { path: "/deck/:id/:mode", name: "session", component: SessionView, props: true },
    { path: "/deck/:id/:mode/result", name: "result", component: ResultView, props: true },
    { path: "/:pathMatch(.*)*", redirect: { name: "home" } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

/** Keeps hand-typed or stale URLs from rendering an empty session. */
router.beforeEach((to) => {
  const id = to.params.id;
  if (typeof id !== "string") return true;

  const deck = getDeck(id);
  if (!deck) return { name: "home" };

  const mode = to.params.mode;
  if (typeof mode !== "string") return true;
  if (!isMode(mode) || !availableModes(deck).includes(mode)) {
    return { name: "deck", params: { id } };
  }
  return true;
});
