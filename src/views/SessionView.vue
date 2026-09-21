<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QuizSession from "../components/QuizSession.vue";
import { getDeck, postAttempt } from "../api";
import type { ItemResult } from "../progress";
import { lastResult, takeRetryQueue } from "../session";
import { MODE_LABELS, buildQuestions, isMode } from "../study/modes";
import { seeded } from "../study/rng";
import type { Deck, Question } from "../types";

const props = defineProps<{ id: string; mode: string }>();
const router = useRouter();

const deck = ref<Deck | undefined>();
const mode = computed(() => (isMode(props.mode) ? props.mode : undefined));
const questions = ref<Question[]>([]);

async function build(): Promise<void> {
  deck.value = await getDeck(props.id);
  if (!deck.value || !mode.value) return;
  // A retry session replays the missed questions; a fresh one gets a new seed
  // so the order differs every time.
  questions.value =
    takeRetryQueue() ?? buildQuestions(deck.value, mode.value, seeded(Date.now() >>> 0));
}

watch(() => [props.id, props.mode], build, { immediate: true });

function finish(payload: {
  correct: number;
  total: number;
  missed: Question[];
  results: ItemResult[];
}): void {
  if (!mode.value) return;
  // Recording is fire-and-forget: a slow or missing backend must not hold up
  // the score screen, and the API layer keeps a local copy either way.
  void postAttempt({
    deckId: props.id,
    mode: mode.value,
    correct: payload.correct,
    total: payload.total,
    items: payload.results,
  });
  lastResult.value = {
    deckId: props.id,
    mode: mode.value,
    correct: payload.correct,
    total: payload.total,
    missed: payload.missed,
  };
  router.push({ name: "result", params: { id: props.id, mode: mode.value } });
}
</script>

<template>
  <QuizSession
    v-if="deck && mode && questions.length"
    :questions="questions"
    :label="`${deck.title} · ${MODE_LABELS[mode]}`"
    @done="finish"
  />
  <main v-else class="page">
    <RouterLink class="back" :to="{ name: 'deck', params: { id } }">← Back to deck</RouterLink>
    <p class="prompt-en">Nothing to study here yet.</p>
  </main>
</template>
