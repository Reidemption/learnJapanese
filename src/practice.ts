import type { Router } from "vue-router";
import { customDeck } from "./session";
import { availableModes } from "./study/modes";
import { missedDeck } from "./study/test";
import type { Deck } from "./types";

/**
 * Opens a practice session of just these units, from any decks: a Custom
 * deck that borrows the rest of their decks as distractors, on the first
 * mode it can play. False when there is nothing to practise.
 */
export function practiseUnits(router: Router, decks: Deck[], unitIds: string[], title: string): boolean {
  if (!unitIds.length) return false;
  const deck = missedDeck(decks, unitIds, title);
  const mode = availableModes(deck)[0];
  if (!mode) return false;
  customDeck.value = deck;
  void router.push({ name: "custom-session", params: { mode } });
  return true;
}
