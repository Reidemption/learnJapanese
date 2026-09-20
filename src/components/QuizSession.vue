<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { saveQuizScore, shuffle } from "../progress";
import type { Choice, Jlpt, Question } from "../types";
import RubyText from "./RubyText.vue";

const props = defineProps<{
  categoryId: string;
  jlpt: Jlpt;
  pool: Question[];
}>();

const emit = defineEmits<{
  done: [payload: { correct: number; total: number; missed: Question[] }];
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

const current = computed(() => items.value[index.value]);
const locked = computed(() => picked.value !== null);

function start(): void {
  items.value = shuffle(props.pool).map((question) => ({
    question,
    choices: shuffle(question.choices),
  }));
  index.value = 0;
  picked.value = null;
  correctCount.value = 0;
  missed.value = [];
}

function pick(id: string): void {
  if (locked.value || !current.value) return;
  picked.value = id;
  const q = current.value.question;
  if (id === q.correctId) correctCount.value += 1;
  else missed.value.push(q);
}

function goNext(): void {
  if (!locked.value) return;
  if (index.value + 1 >= items.value.length) {
    const total = items.value.length;
    saveQuizScore(props.categoryId, props.jlpt, {
      correct: correctCount.value,
      total,
      at: Date.now(),
    });
    emit("done", {
      correct: correctCount.value,
      total,
      missed: missed.value,
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
  return "";
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

onMounted(() => {
  start();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <section v-if="current" class="page">
    <p class="session-bar" style="margin-top: 1rem">
      <span>{{ jlpt }} · {{ index + 1 }} / {{ items.length }}</span>
      <span>{{ current.question.kind }}</span>
    </p>
    <div class="prompt">
      <RubyText :segments="current.question.promptJa" />
      <p v-if="current.question.promptEn" class="prompt-en">
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
        <span class="num">{{ i + 1 }}</span>
        <span v-if="choice.en">{{ choice.en }}</span>
        <RubyText v-else-if="choice.ja" :segments="choice.ja" />
      </button>
    </div>
    <div class="next-row">
      <button v-if="locked" class="primary" type="button" @click="goNext">
        {{ index + 1 >= items.length ? "See score" : "Next" }}
      </button>
    </div>
  </section>
</template>
