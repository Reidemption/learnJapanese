<script setup lang="ts">
import { computed } from "vue";
import { decks } from "../content";
import { deckBest } from "../progress";
import type { Deck, DeckGroup, Jlpt } from "../types";

const GROUP_LABELS: Record<DeckGroup, string> = {
  phrases: "Phrases",
  vocab: "Vocabulary",
  verbs: "Verbs",
  numbers: "Numbers",
  kanji: "Kanji",
  grammar: "Grammar",
  particles: "Particles",
};

type Section = { group: DeckGroup; decks: Deck[] };
type LevelBlock = { level: Jlpt; sections: Section[]; count: number };

const levels = computed<LevelBlock[]>(() => {
  const byLevel = new Map<Jlpt, Map<DeckGroup, Deck[]>>();
  for (const deck of decks) {
    const groups = byLevel.get(deck.level) ?? new Map<DeckGroup, Deck[]>();
    groups.set(deck.group, [...(groups.get(deck.group) ?? []), deck]);
    byLevel.set(deck.level, groups);
  }
  return [...byLevel].map(([level, groups]) => ({
    level,
    count: [...groups.values()].reduce((n, list) => n + list.length, 0),
    sections: [...groups].map(([group, list]) => ({ group, decks: list })),
  }));
});

function bestLabel(deck: Deck): string {
  const best = deckBest(deck.id);
  if (best === undefined) return `${deck.items.length} items`;
  return `${deck.items.length} items · best ${Math.round(best * 100)}%`;
}
</script>

<template>
  <main class="page">
    <section class="hero">
      <h1>習い</h1>
      <p>Small topic decks for JLPT N5. Pick one, then pick how you want to drill it.</p>
    </section>

    <section v-for="block in levels" :key="block.level" class="level-block">
      <h2 class="level-heading">
        {{ block.level }}
        <small>{{ block.count }} decks</small>
      </h2>

      <div v-for="section in block.sections" :key="section.group" class="deck-section">
        <h3 class="group-heading">{{ GROUP_LABELS[section.group] }}</h3>
        <div class="category-list">
          <RouterLink
            v-for="deck in section.decks"
            :key="deck.id"
            class="category-row"
            :to="{ name: 'deck', params: { id: deck.id } }"
          >
            <span>
              <span class="en">{{ deck.title }}</span>
              <span class="ja">{{ deck.titleJa }}</span>
            </span>
            <span class="meta">{{ bestLabel(deck) }}</span>
          </RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>
