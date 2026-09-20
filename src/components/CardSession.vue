<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  correctChoice,
  filledPrompt,
  setCardMark,
  shuffle,
} from "../progress";
import type { Jlpt, Question } from "../types";
import RubyText from "./RubyText.vue";

const props = defineProps<{
  jlpt: Jlpt;
  pool: Question[];
}>();

const emit = defineEmits<{
  done: [];
}>();

const deck = ref<Question[]>([]);
const index = ref(0);
const flipped = ref(false);
const known = ref(0);
const learning = ref(0);

const current = computed(() => deck.value[index.value]);
const answer = computed(() => (current.value ? correctChoice(current.value) : null));
const backJa = computed(() => {
  if (!current.value) return [];
  if (current.value.kind === "cloze") return filledPrompt(current.value);
  return answer.value?.ja ?? [];
});

function flip(): void {
  flipped.value = true;
}

function mark(kind: "known" | "learning"): void {
  if (!current.value || !flipped.value) return;
  setCardMark(current.value.id, kind);
  if (kind === "known") known.value += 1;
  else learning.value += 1;
  if (index.value + 1 >= deck.value.length) {
    emit("done");
    return;
  }
  index.value += 1;
  flipped.value = false;
}

function onKey(event: KeyboardEvent): void {
  if (event.code === "Space") {
    event.preventDefault();
    if (!flipped.value) flip();
  }
}

onMounted(() => {
  deck.value = shuffle(props.pool);
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <section v-if="current" class="page">
    <p class="session-bar" style="margin-top: 1rem">
      <span>{{ jlpt }} · {{ index + 1 }} / {{ deck.length }}</span>
      <span>{{ known }} known · {{ learning }} learning</span>
    </p>
    <button class="card" type="button" @click="flip">
      <div v-if="!flipped">
        <RubyText :segments="current.promptJa" />
        <p v-if="current.promptEn" class="prompt-en">{{ current.promptEn }}</p>
      </div>
      <div v-else>
        <p v-if="answer?.en">{{ answer.en }}</p>
        <RubyText v-if="backJa.length" :segments="backJa" />
      </div>
    </button>
    <p class="prompt-en" style="text-align: center">
      {{ flipped ? "Mark this card" : "Click or space to flip" }}
    </p>
    <div v-if="flipped" class="card-actions">
      <button class="secondary" type="button" @click="mark('learning')">Still learning</button>
      <button class="primary" type="button" @click="mark('known')">Knew it</button>
    </div>
  </section>
</template>
