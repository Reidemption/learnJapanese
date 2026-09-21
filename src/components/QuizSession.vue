<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { itemIdOf, shuffle } from "../progress";
import type { ItemResult } from "../progress";
import type { Choice, Question } from "../types";
import RubyText from "./RubyText.vue";

const props = defineProps<{
  questions: Question[];
  label: string;
}>();

const emit = defineEmits<{
  done: [
    payload: {
      correct: number;
      total: number;
      missed: Question[];
      results: ItemResult[];
    },
  ];
}>();

type Item = {
  question: Question;
  choices: Choice[];
};

const items = ref<Item[]>([]);
const index = ref(0);
const picked = ref<string | null>(null);
const correctCount = ref(0);
const missed = ref<Question[]>([]);
const results = ref<ItemResult[]>([]);

const current = computed(() => items.value[index.value]);
const locked = computed(() => picked.value !== null);

function start(): void {
  items.value = props.questions.map((question) => ({
    question,
    // Choices arrive with the answer first, so they are shuffled per question.
    choices: shuffle(question.choices),
  }));
  index.value = 0;
  picked.value = null;
  correctCount.value = 0;
  missed.value = [];
  results.value = [];
}

function pick(id: string): void {
  if (locked.value || !current.value) return;
  picked.value = id;
  const question = current.value.question;
  const right = id === question.correctId;
  if (right) correctCount.value += 1;
  else missed.value.push(question);
  results.value.push({ itemId: itemIdOf(question), correct: right });
}

function goNext(): void {
  if (!locked.value) return;
  if (index.value + 1 >= items.value.length) {
    emit("done", {
      correct: correctCount.value,
      total: items.value.length,
      missed: missed.value,
      results: results.value,
    });
    return;
  }
  index.value += 1;
  picked.value = null;
}

function choiceClass(id: string): string {
  if (!picked.value || !current.value) return "";
  const right = current.value.question.correctId;
  if (id === right) return "is-correct";
  if (id === picked.value) return "is-wrong";
  return "is-dim";
}

/** After answering, the number badge becomes a ✓ or ✗, so the result never relies on colour alone. */
function badge(id: string, i: number): string {
  const cls = choiceClass(id);
  if (cls === "is-correct") return "✓";
  if (cls === "is-wrong") return "✗";
  return String(i + 1);
}

function onKey(event: KeyboardEvent): void {
  if (!current.value) return;
  if (event.key === "Enter") {
    event.preventDefault();
    goNext();
    return;
  }
  const n = Number(event.key);
  if (n >= 1 && n <= 4 && !locked.value) {
    const choice = current.value.choices[n - 1];
    if (choice) pick(choice.id);
  }
}

// Built during setup so the first render already has a question on screen.
watch(() => props.questions, start, { immediate: true });
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <section v-if="current" class="page">
    <p class="session-bar" style="margin-top: 1rem">
      <span>{{ label }}</span>
      <span>{{ index + 1 }} / {{ items.length }}</span>
    </p>
    <div class="prompt">
      <RubyText v-if="current.question.promptJa.length" :segments="current.question.promptJa" />
      <p
        v-if="current.question.promptEn"
        :class="current.question.promptJa.length ? 'prompt-en' : 'prompt-lead'"
      >
        {{ current.question.promptEn }}
      </p>
    </div>
    <div class="choices">
      <button
        v-for="(choice, i) in current.choices"
        :key="choice.id"
        class="choice"
        :class="choiceClass(choice.id)"
        :disabled="locked"
        type="button"
        @click="pick(choice.id)"
      >
        <span class="num">{{ badge(choice.id, i) }}</span>
        <span v-if="choice.en">{{ choice.en }}</span>
        <RubyText v-else-if="choice.ja" :segments="choice.ja" />
      </button>
    </div>
    <div class="next-row align-end">
      <button v-if="locked" class="primary" type="button" @click="goNext">
        {{ index + 1 >= items.length ? "See score" : "Next" }}
      </button>
    </div>
  </section>
</template>
