<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QuizSession, { type QuizDone } from "../components/QuizSession.vue";
import Stopwatch from "../components/Stopwatch.vue";
import { allDecks, getDeck, postAttempt } from "../api";
import { lastTest, testRunning } from "../session";
import { settings } from "../settings";
import { unitsOf } from "../study/analytics";
import { seeded } from "../study/rng";
import { buildTest } from "../study/test";
import type { Deck, Question } from "../types";

const props = defineProps<{ id: string }>();
const router = useRouter();

const deck = ref<Deck | undefined>();
const questions = ref<Question[]>([]);
const loaded = ref(false);
const startedAt = ref(Date.now());

async function build(): Promise<void> {
  loaded.value = false;
  const [found, decks] = await Promise.all([getDeck(props.id), allDecks()]);
  deck.value = found;
  questions.value = found ? buildTest(unitsOf(found), decks, seeded(Date.now() >>> 0)) : [];
  startedAt.value = Date.now();
  loaded.value = true;
}

watch(() => props.id, build, { immediate: true });

// The header locks Kana and Hints while this is on screen.
onMounted(() => (testRunning.value = true));
onUnmounted(() => (testRunning.value = false));

function finish(payload: QuizDone): void {
  const elapsedMs = settings.timer ? Date.now() - startedAt.value : null;
  // Fire-and-forget, as for practice. No timing is sent: it's just for fun.
  void postAttempt({
    deckId: props.id,
    scope: "deck",
    mode: "test",
    correct: payload.correct,
    total: payload.total,
    kana: false,
    hints: false,
    items: payload.results,
  });
  lastTest.value = {
    deckId: props.id,
    units: payload.units ?? [],
    questions: questions.value.length,
    elapsedMs,
  };
  router.push({ name: "test-result", params: { id: props.id } });
}
</script>

<template>
  <QuizSession
    v-if="deck && questions.length"
    :questions="questions"
    :label="`${deck.title} · Test`"
    test
    @done="finish"
  >
    <template #bar>
      <Stopwatch v-if="settings.timer" :started-at="startedAt" />
    </template>
  </QuizSession>
  <main v-else-if="loaded" class="page">
    <RouterLink class="back" :to="{ name: 'deck', params: { id } }">← Back to deck</RouterLink>
    <p class="prompt-en">Nothing to test here yet.</p>
  </main>
</template>
