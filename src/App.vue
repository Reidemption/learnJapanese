<script setup lang="ts">
import { computed, ref } from "vue";
import CardSession from "./components/CardSession.vue";
import QuizSession from "./components/QuizSession.vue";
import RubyText from "./components/RubyText.vue";
import { categories, getCategory } from "./data";
import {
  correctChoice,
  filledPrompt,
  getQuizScore,
  knownCount,
  questionsFor,
} from "./progress";
import { settings } from "./settings";
import type { Category, Jlpt, Question } from "./types";

type View =
  | { name: "home" }
  | { name: "category"; id: string }
  | { name: "quiz"; id: string; jlpt: Jlpt }
  | { name: "score"; id: string; jlpt: Jlpt; correct: number; total: number; missed: Question[] }
  | { name: "cards"; id: string; jlpt: Jlpt }
  | { name: "cards-done"; id: string };

const view = ref<View>({ name: "home" });

const openCategory = computed(() => {
  if (view.value.name === "home") return undefined;
  return getCategory(view.value.id);
});

const pool = computed(() => {
  const v = view.value;
  if (v.name !== "quiz" && v.name !== "cards") return [];
  const cat = getCategory(v.id);
  return cat ? questionsFor(v.jlpt, cat.questions) : [];
});

function countFor(cat: Category, jlpt: Jlpt): number {
  return questionsFor(jlpt, cat.questions).length;
}

function scoreLabel(cat: Category, jlpt: Jlpt): string {
  const score = getQuizScore(cat.id, jlpt);
  if (!score) return `${countFor(cat, jlpt)} questions`;
  return `last quiz ${score.correct}/${score.total}`;
}

function missAnswer(q: Question): string {
  const choice = correctChoice(q);
  if (choice.en) return choice.en;
  return (choice.ja ?? []).map((s) => s.ja).join("");
}

function finishQuiz(payload: { correct: number; total: number; missed: Question[] }): void {
  const current = view.value;
  if (current.name !== "quiz") return;
  view.value = {
    name: "score",
    id: current.id,
    jlpt: current.jlpt,
    ...payload,
  };
}

function finishCards(): void {
  const current = view.value;
  if (current.name !== "cards") return;
  view.value = { name: "cards-done", id: current.id };
}
</script>

<template>
  <div class="shell">
    <header class="site-header">
      <a class="brand" href="#" @click.prevent="view = { name: 'home' }">
        習い
        <small>N5 · N4 study</small>
      </a>
      <div class="toggles">
        <button
          class="toggle"
          type="button"
          :aria-pressed="settings.kana"
          @click="settings.kana = !settings.kana"
        >
          Kana
        </button>
        <button
          class="toggle"
          type="button"
          :aria-pressed="settings.hints"
          @click="settings.hints = !settings.hints"
        >
          Hints
        </button>
      </div>
    </header>

    <main v-if="view.name === 'home'" class="page">
      <section class="hero">
        <h1>習い</h1>
        <p>Short quizzes for JLPT N5 and N4. Cards are there if you want a quieter pass.</p>
      </section>
      <div class="category-list">
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="category-row"
          type="button"
          @click="view = { name: 'category', id: cat.id }"
        >
          <span>
            <span class="en">{{ cat.title }}</span>
            <span class="ja">{{ cat.titleJa }}</span>
          </span>
          <span class="meta">{{ cat.questions.length }} items</span>
        </button>
      </div>
    </main>

    <main v-else-if="view.name === 'category' && openCategory" class="page">
      <button class="back" type="button" @click="view = { name: 'home' }">← All categories</button>
      <section class="hero">
        <h1>{{ openCategory.titleJa }}</h1>
        <p>{{ openCategory.title }}</p>
      </section>
      <div
        v-for="level in (['N5', 'N4'] as const)"
        :key="level"
        class="level-row"
      >
        <div>
          <h2>{{ level }}</h2>
          <p>
            {{ scoreLabel(openCategory, level) }}
            · {{ knownCount(questionsFor(level, openCategory.questions)) }} cards known
          </p>
        </div>
        <div class="actions">
          <button
            class="ghost"
            type="button"
            @click="view = { name: 'cards', id: openCategory.id, jlpt: level }"
          >
            Cards
          </button>
          <button
            class="primary"
            type="button"
            @click="view = { name: 'quiz', id: openCategory.id, jlpt: level }"
          >
            Quiz
          </button>
        </div>
      </div>
    </main>

    <QuizSession
      v-else-if="view.name === 'quiz' && pool.length"
      :category-id="view.id"
      :jlpt="view.jlpt"
      :pool="pool"
      @done="finishQuiz"
    />

    <main v-else-if="view.name === 'score'" class="page score">
      <button class="back" type="button" @click="view = { name: 'category', id: view.id }">
        ← {{ openCategory?.title }}
      </button>
      <h2>{{ view.correct }} / {{ view.total }}</h2>
      <p class="prompt-en">{{ view.jlpt }} quiz</p>
      <ul v-if="view.missed.length" class="misses">
        <li v-for="q in view.missed" :key="q.id">
          <RubyText :segments="q.kind === 'cloze' ? filledPrompt(q) : q.promptJa" />
          <div class="prompt-en">{{ missAnswer(q) }}</div>
        </li>
      </ul>
      <p v-else class="prompt-en">Nothing missed.</p>
      <div class="next-row">
        <button class="primary" type="button" @click="view = { name: 'home' }">Home</button>
      </div>
    </main>

    <CardSession
      v-else-if="view.name === 'cards' && pool.length"
      :jlpt="view.jlpt"
      :pool="pool"
      @done="finishCards"
    />

    <main v-else-if="view.name === 'cards-done'" class="page score">
      <h2>Cards done</h2>
      <p class="prompt-en">Known and still-learning marks are saved on this browser.</p>
      <div class="next-row">
        <button class="primary" type="button" @click="view = { name: 'category', id: view.id }">
          Back
        </button>
      </div>
    </main>
  </div>
</template>
