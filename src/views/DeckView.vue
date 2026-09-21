<script setup lang="ts">
import { computed, ref, watch } from "vue";
import MasteryLegend from "../components/MasteryLegend.vue";
import RubyText from "../components/RubyText.vue";
import StackedBar from "../components/charts/StackedBar.vue";
import { emptyProgress, getDeck, getProgress, scoreKeyOf, type Progress } from "../api";
import { splitOf, unitsOf } from "../study/analytics";
import { MODE_HINTS, MODE_LABELS, availableModes, buildQuestions, sessionRng } from "../study/modes";
import { parseRuby } from "../study/ruby";
import type { Mode } from "../study/modes";
import type { Deck } from "../types";

const props = defineProps<{ id: string }>();

const deck = ref<Deck | undefined>();
const progress = ref<Progress>(emptyProgress());
const modes = computed(() => (deck.value ? availableModes(deck.value) : []));
const mastery = computed(() =>
  deck.value ? splitOf(unitsOf(deck.value), progress.value.items) : undefined,
);

watch(
  () => props.id,
  async (id) => {
    deck.value = await getDeck(id);
    progress.value = await getProgress();
  },
  { immediate: true },
);

function questionCount(mode: Mode): number {
  if (!deck.value) return 0;
  return buildQuestions(deck.value, mode, sessionRng(props.id, mode)).length;
}

function scoreLabel(mode: Mode): string {
  const score = progress.value.decks[scoreKeyOf(props.id, mode)];
  if (!score) return `${questionCount(mode)} questions`;
  const total = score.total ?? questionCount(mode);
  return `best ${score.best}/${total} · last ${score.last}/${total}`;
}
</script>

<template>
  <main v-if="deck" class="page">
    <RouterLink class="back" :to="{ name: 'home' }">← All decks</RouterLink>

    <section class="hero">
      <h1 class="ja">{{ deck.titleJa }}</h1>
      <p>{{ deck.level }} · {{ deck.title }} · {{ deck.items.length }} items</p>
    </section>

    <section v-if="mastery" class="deck-mastery">
      <StackedBar :split="mastery" />
      <MasteryLegend :split="mastery" />
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
