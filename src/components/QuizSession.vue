<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { PRESENTATION, TEST_PRESENTATION } from "../presentation";
import { itemIdOf, shuffle } from "../progress";
import type { ItemResult } from "../progress";
import { scoreTest, type TestAnswers, type UnitResult } from "../study/test";
import type { Choice, Question } from "../types";
import RubyText from "./RubyText.vue";

const props = defineProps<{
  questions: Question[];
  label: string;
  /**
   * A test: no furigana or hints whatever the header says, no feedback until
   * the end, and an "I don't know" choice (key 0). Scored per unit.
   */
  test?: boolean;
}>();

export type QuizDone = {
  /** Questions right; for a test, units passed. */
  correct: number;
  /** Questions; for a test, units. */
  total: number;
  missed: Question[];
  results: ItemResult[];
  /** A test's result per unit. */
  units?: UnitResult[];
};

const emit = defineEmits<{
  done: [payload: QuizDone];
}>();

// Fixed for the component's life: a session never turns into a test.
if (props.test) provide(PRESENTATION, TEST_PRESENTATION);

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
const answers = ref<TestAnswers>({});

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
  answers.value = {};
}

/** `id` null is "I don't know", offered in tests only. */
function pick(id: string | null): void {
  if (locked.value || !current.value) return;
  if (id === null && !props.test) return;
  picked.value = id ?? "";
  const question = current.value.question;
  const right = id === question.correctId;
  if (right) correctCount.value += 1;
  else missed.value.push(question);
  results.value.push({
    itemId: itemIdOf(question),
    mode: question.kind,
    correct: right,
    ...(id === null ? { skipped: true } : {}),
  });
  answers.value[question.id] = id;
  // A test gives no feedback: straight on to the next question.
  if (props.test) goNext();
}

function goNext(): void {
  if (!locked.value) return;
  if (index.value + 1 >= items.value.length) {
    emit("done", props.test ? testPayload() : {
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

function testPayload(): QuizDone {
  const { units } = scoreTest(props.questions, answers.value);
  return {
    correct: units.filter((unit) => unit.passed).length,
    total: units.length,
    missed: missed.value,
    results: results.value,
    units,
  };
}

function choiceClass(id: string): string {
  if (props.test || !picked.value || !current.value) return "";
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
  // Leave browser shortcuts (Ctrl+1 switches tabs) and form controls alone.
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLSelectElement) return;
  if (event.key === "Enter") {
    event.preventDefault();
    goNext();
    return;
  }
  if (event.key === "0" && props.test) {
    pick(null);
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
      <slot name="bar" />
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
      <button v-if="test" class="choice dont-know" type="button" @click="pick(null)">
        <span class="num">0</span>
        <span>I don't know</span>
      </button>
    </div>
    <div v-if="!test" class="next-row align-end">
      <button v-if="locked" class="primary" type="button" @click="goNext">
        {{ index + 1 >= items.length ? "See score" : "Next" }}
      </button>
    </div>
  </section>
</template>
