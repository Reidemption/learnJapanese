<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QuizSession, { type QuizDone } from "../components/QuizSession.vue";
import Stopwatch from "../components/Stopwatch.vue";
import { allDecks, getProgress, postAttempt } from "../api";
import { lastTest, testRunning, wordTestUnits } from "../session";
import { settings } from "../settings";
import { isWordSet, unitsOf, wordSet, type Unit, type WordSetKind } from "../study/analytics";
import { seeded } from "../study/rng";
import { buildTest } from "../study/test";
import type { Deck, Jlpt, Question } from "../types";

/**
 * A deck test (`id`) or a word test (`set`: ready, missed, weak, or "these"
 * for the words in `wordTestUnits`).
 */
const props = defineProps<{ id?: string; set?: string; level?: Jlpt }>();
const router = useRouter();

const WORD_SET_TITLES: Record<WordSetKind, string> = {
  ready: "Ready words",
  missed: "Missed words",
  weak: "Weak words",
};

const title = ref("");
const questions = ref<Question[]>([]);
const loaded = ref(false);
const startedAt = ref(Date.now());

async function unitsFor(decks: Deck[]): Promise<Unit[]> {
  if (props.id) {
    const deck = decks.find((d) => d.id === props.id);
    title.value = deck?.title ?? "";
    return deck ? unitsOf(deck) : [];
  }
  if (props.set === "these") {
    const chosen = wordTestUnits.value;
    title.value = chosen?.title ?? "";
    const ids = new Set(chosen?.unitIds ?? []);
    return decks.flatMap(unitsOf).filter((unit) => ids.has(unit.id));
  }
  if (props.set && isWordSet(props.set)) {
    title.value = WORD_SET_TITLES[props.set];
    const { items } = await getProgress();
    return wordSet(decks, items, props.level ?? "N5", props.set, seeded(Date.now() >>> 0));
  }
  return [];
}

async function build(): Promise<void> {
  loaded.value = false;
  const decks = await allDecks();
  const units = await unitsFor(decks);
  questions.value = buildTest(units, decks, seeded(Date.now() >>> 0));
  startedAt.value = Date.now();
  loaded.value = true;
}

watch(() => [props.id, props.set], build, { immediate: true });

// The header locks Kana and Hints while this is on screen.
onMounted(() => (testRunning.value = true));
onUnmounted(() => (testRunning.value = false));

const backTo = computed(() =>
  props.id ? { name: "deck", params: { id: props.id } } : { name: "dashboard" },
);

function finish(payload: QuizDone): void {
  const elapsedMs = settings.timer ? Date.now() - startedAt.value : null;
  // Fire-and-forget, as for practice. No timing is sent: it's just for fun.
  void postAttempt({
    // A word test spans decks, so it belongs to none.
    deckId: props.id ?? "",
    scope: props.id ? "deck" : "words",
    mode: "test",
    correct: payload.correct,
    total: payload.total,
    kana: false,
    hints: false,
    items: payload.results,
  });
  lastTest.value = {
    deckId: props.id ?? "",
    ...(props.set ? { set: props.set } : {}),
    title: title.value,
    units: payload.units ?? [],
    questions: questions.value.length,
    elapsedMs,
  };
  void router.push(
    props.id
      ? { name: "test-result", params: { id: props.id } }
      : { name: "word-test-result", params: { set: props.set } },
  );
}
</script>

<template>
  <QuizSession
    v-if="questions.length"
    :questions="questions"
    :label="`${title} · Test`"
    test
    @done="finish"
  >
    <template #bar>
      <Stopwatch v-if="settings.timer" :started-at="startedAt" />
    </template>
  </QuizSession>
  <main v-else-if="loaded" class="page">
    <RouterLink class="back" :to="backTo">{{ id ? "← Back to deck" : "← Progress" }}</RouterLink>
    <p class="prompt-en">Nothing to test here yet.</p>
  </main>
</template>
