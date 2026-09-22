<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QuizSession from "../components/QuizSession.vue";
import { getDeck, postAttempt } from "../api";
import type { ItemResult } from "../progress";
import { customDeck, lastResult, takeRetryQueue } from "../session";
import { MODE_LABELS, buildQuestions, isMode } from "../study/modes";
import { seeded } from "../study/rng";
import { settings } from "../settings";
import type { Deck, Question } from "../types";

/** `custom`: play the Custom deck in `session.ts` rather than deck `id`. */
const props = defineProps<{ id: string; mode: string; custom?: boolean }>();
const router = useRouter();

const deck = ref<Deck | undefined>();
const mode = computed(() => (isMode(props.mode) ? props.mode : undefined));
const questions = ref<Question[]>([]);
/** A "Retry missed" run, which is recorded but is not a score for the deck. */
const isRetry = ref(false);

// Whether furigana / hints were on at any point during the session. Reading
// mode hides furigana whatever the toggle says, so it never counts as kana.
const kanaUsed = ref(false);
const hintsUsed = ref(false);
watch(
  () => [settings.kana, settings.hints, mode.value],
  () => {
    if (settings.kana && mode.value !== "reading") kanaUsed.value = true;
    if (settings.hints) hintsUsed.value = true;
  },
  { immediate: true },
);

async function build(): Promise<void> {
  kanaUsed.value = settings.kana && mode.value !== "reading";
  hintsUsed.value = settings.hints;
  deck.value = props.custom ? (customDeck.value ?? undefined) : await getDeck(props.id);
  if (!deck.value || !mode.value) return;
  // A retry session replays the missed questions; a fresh one gets a new seed
  // so the order differs every time.
  const retry = takeRetryQueue();
  isRetry.value = retry !== null;
  questions.value = retry ?? buildQuestions(deck.value, mode.value, seeded(Date.now() >>> 0));
}

watch(() => [props.id, props.mode, props.custom], build, { immediate: true });

const backTo = computed(() =>
  props.custom ? { name: "custom" } : { name: "deck", params: { id: props.id } },
);

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
    // A Custom session spans decks, so it belongs to none.
    deckId: props.custom ? "" : props.id,
    ...(props.custom ? { scope: "custom" as const } : {}),
    mode: mode.value,
    correct: payload.correct,
    total: payload.total,
    kana: kanaUsed.value,
    hints: hintsUsed.value,
    ...(isRetry.value ? { retry: true } : {}),
    items: payload.results,
  });
  lastResult.value = {
    deckId: props.id,
    mode: mode.value,
    correct: payload.correct,
    total: payload.total,
    missed: payload.missed,
  };
  router.push(
    props.custom
      ? { name: "custom-result", params: { mode: mode.value } }
      : { name: "result", params: { id: props.id, mode: mode.value } },
  );
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
    <RouterLink class="back" :to="backTo">{{ custom ? "← Custom study" : "← Back to deck" }}</RouterLink>
    <p class="prompt-en">Nothing to study here yet.</p>
  </main>
</template>
