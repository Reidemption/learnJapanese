<script setup lang="ts">
import { computed } from "vue";
import RubyText from "../components/RubyText.vue";
import { getDeck } from "../content";
import { getScore } from "../progress";
import { MODE_HINTS, MODE_LABELS, availableModes, buildQuestions, sessionRng } from "../study/modes";
import { parseRuby } from "../study/ruby";
import type { Mode } from "../study/modes";

const props = defineProps<{ id: string }>();

const deck = computed(() => getDeck(props.id));
const modes = computed(() => (deck.value ? availableModes(deck.value) : []));

function questionCount(mode: Mode): number {
  if (!deck.value) return 0;
  return buildQuestions(deck.value, mode, sessionRng(props.id, mode)).length;
}

function scoreLabel(mode: Mode): string {
  const score = getScore(props.id, mode);
  if (!score) return `${questionCount(mode)} questions`;
  return `best ${score.best}/${score.total} · last ${score.last}/${score.total}`;
}
</script>

<template>
  <main v-if="deck" class="page">
    <RouterLink class="back" :to="{ name: 'home' }">← All decks</RouterLink>

    <section class="hero">
      <h1>{{ deck.titleJa }}</h1>
      <p>{{ deck.level }} · {{ deck.title }} · {{ deck.items.length }} items</p>
    </section>

    <div v-for="mode in modes" :key="mode" class="level-row">
      <div>
        <h2>{{ MODE_LABELS[mode] }}</h2>
        <p>{{ MODE_HINTS[mode] }} · {{ scoreLabel(mode) }}</p>
      </div>
      <div class="actions">
        <RouterLink
          class="primary"
          :to="{ name: 'session', params: { id: deck.id, mode } }"
        >
          Start
        </RouterLink>
      </div>
    </div>

    <section class="preview">
      <h3 class="group-heading">In this deck</h3>
      <ul class="item-list">
        <li v-for="item in deck.items" :key="item.id">
          <RubyText :segments="parseRuby(item.ja)" />
          <span class="prompt-en">{{ item.en }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
