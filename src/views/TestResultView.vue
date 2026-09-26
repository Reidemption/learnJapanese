<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import RubyText from "../components/RubyText.vue";
import { allDecks, getDeck } from "../api";
import { customDeck, lastTest } from "../session";
import { MODE_LABELS, availableModes } from "../study/modes";
import { parseRuby } from "../study/ruby";
import { missedDeck, type UnitResult } from "../study/test";
import { formatAverage, formatElapsed } from "../study/time";
import type { Deck, RubySegment } from "../types";

const props = defineProps<{ id: string }>();
const router = useRouter();

const deck = ref<Deck | undefined>();
watch(
  () => props.id,
  async (id) => {
    deck.value = await getDeck(id);
  },
  { immediate: true },
);

/** Only this deck's result: a refresh leaves nothing to show. */
const result = computed(() => {
  const value = lastTest.value;
  return value && value.deckId === props.id ? value : undefined;
});

const failed = computed(() => result.value?.units.filter((unit) => !unit.passed) ?? []);
const passed = computed(() => result.value?.units.filter((unit) => unit.passed) ?? []);

/** The unit's Japanese with its answer in: the item, or the cloze sentence filled in. */
function japaneseOf(unit: UnitResult): RubySegment[] {
  const found = deck.value?.items.find((item) => item.id === unit.unitId);
  if (found) return parseRuby(found.ja);
  const cloze = deck.value?.questions?.find((q) => q.id === unit.unitId);
  if (!cloze) return [];
  const answer = parseRuby(cloze.answer);
  return parseRuby(cloze.prompt).flatMap((part) => (part.blank ? answer : [part]));
}

function englishOf(unit: UnitResult): string {
  const found = deck.value?.items.find((item) => item.id === unit.unitId);
  if (found) return found.en;
  return deck.value?.questions?.find((q) => q.id === unit.unitId)?.en ?? "";
}

/** "Missed: Reading, Recall (didn't know)". */
function missedLabel(unit: UnitResult): string {
  const parts = unit.questions
    .filter((q) => !q.correct)
    .map((q) => `${MODE_LABELS[q.question.kind]}${q.skipped ? " (didn't know)" : ""}`);
  return `Missed: ${parts.join(", ")}`;
}

const timing = computed(() => {
  const ms = result.value?.elapsedMs;
  if (ms === null || ms === undefined || !result.value) return undefined;
  return `${formatElapsed(ms)} · ${formatAverage(ms, result.value.questions)} per question`;
});

async function practiseMissed(): Promise<void> {
  if (!deck.value || !failed.value.length) return;
  const practice = missedDeck(
    await allDecks(),
    failed.value.map((unit) => unit.unitId),
    `Missed in ${deck.value.title}`,
  );
  const mode = availableModes(practice)[0];
  if (!mode) return;
  customDeck.value = practice;
  router.push({ name: "custom-session", params: { mode } });
}
</script>

<template>
  <main v-if="deck && result" class="page score test-result">
    <RouterLink class="back" :to="{ name: 'deck', params: { id } }">← {{ deck.title }}</RouterLink>

    <h2>{{ passed.length }} / {{ result.units.length }}</h2>
    <p class="prompt-en">{{ deck.level }} · Test · words passed</p>
    <p v-if="timing" class="prompt-en test-time">Time {{ timing }}</p>

    <template v-if="failed.length">
      <h3 class="group-heading">Missed</h3>
      <ul class="misses unit-results">
        <li v-for="unit in failed" :key="unit.unitId" class="unit-result failed">
          <span class="num" aria-label="Failed">✗</span>
          <div>
            <RubyText :segments="japaneseOf(unit)" />
            <div class="prompt-en">{{ englishOf(unit) }}</div>
            <div class="dash-note">{{ missedLabel(unit) }}</div>
          </div>
        </li>
      </ul>
    </template>
    <p v-else class="prompt-en">Every word passed.</p>

    <template v-if="passed.length">
      <h3 class="group-heading">Passed</h3>
      <ul class="misses unit-results">
        <li v-for="unit in passed" :key="unit.unitId" class="unit-result passed">
          <span class="num" aria-label="Passed">✓</span>
          <div>
            <RubyText :segments="japaneseOf(unit)" />
            <div class="prompt-en">{{ englishOf(unit) }}</div>
          </div>
        </li>
      </ul>
    </template>

    <div class="next-row">
      <button v-if="failed.length" class="ghost" type="button" @click="practiseMissed">
        Practise the {{ failed.length }} you missed
      </button>
      <RouterLink class="primary" :to="{ name: 'deck', params: { id } }">Back to deck</RouterLink>
    </div>
  </main>

  <main v-else class="page score">
    <h2>No result to show</h2>
    <p class="prompt-en">Test results live for the session only, so a refresh clears them.</p>
    <div class="next-row">
      <RouterLink class="primary" :to="{ name: 'deck', params: { id } }">Back to deck</RouterLink>
    </div>
  </main>
</template>
