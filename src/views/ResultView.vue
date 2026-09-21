<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import RubyText from "../components/RubyText.vue";
import { getDeck } from "../api";
import { correctChoice, filledPrompt } from "../progress";
import { lastResult, retryQueue } from "../session";
import { MODE_LABELS, isMode } from "../study/modes";
import type { Deck, Question } from "../types";

const props = defineProps<{ id: string; mode: string }>();
const router = useRouter();

const deck = ref<Deck | undefined>();
watch(() => props.id, async (id) => (deck.value = await getDeck(id)), { immediate: true });
const mode = computed(() => (isMode(props.mode) ? props.mode : undefined));

/** Only the result for this deck+mode: a refresh leaves nothing to show. */
const result = computed(() => {
  const value = lastResult.value;
  if (!value || value.deckId !== props.id || value.mode !== props.mode) return undefined;
  return value;
});

function answerText(question: Question): string {
  const choice = correctChoice(question);
  if (choice.en) return choice.en;
  return (choice.ja ?? []).map((s) => s.ja).join("");
}

function promptOf(question: Question) {
  return question.kind === "cloze" ? filledPrompt(question) : question.promptJa;
}

function retryMissed(): void {
  if (!result.value?.missed.length || !mode.value) return;
  retryQueue.value = result.value.missed;
  router.push({ name: "session", params: { id: props.id, mode: mode.value } });
}
</script>

<template>
  <main v-if="deck && result" class="page score">
    <RouterLink class="back" :to="{ name: 'deck', params: { id } }">← {{ deck.title }}</RouterLink>

    <h2>{{ result.correct }} / {{ result.total }}</h2>
    <p class="prompt-en">{{ deck.level }} · {{ mode ? MODE_LABELS[mode] : "" }}</p>

    <ul v-if="result.missed.length" class="misses">
      <li v-for="question in result.missed" :key="question.id">
        <RubyText v-if="promptOf(question).length" :segments="promptOf(question)" />
        <span v-else>{{ question.promptEn }}</span>
        <div class="prompt-en">{{ answerText(question) }}</div>
      </li>
    </ul>
    <p v-else class="prompt-en">Nothing missed.</p>

    <div class="next-row">
      <button v-if="result.missed.length" class="ghost" type="button" @click="retryMissed">
        Retry missed ({{ result.missed.length }})
      </button>
      <RouterLink class="primary" :to="{ name: 'deck', params: { id } }">Back to deck</RouterLink>
    </div>
  </main>

  <main v-else class="page score">
    <h2>No score to show</h2>
    <p class="prompt-en">Results live for the session only, so a refresh clears them.</p>
    <div class="next-row">
      <RouterLink class="primary" :to="{ name: 'deck', params: { id } }">Back to deck</RouterLink>
    </div>
  </main>
</template>
