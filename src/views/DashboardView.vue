<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  emptyProgress,
  getDeck,
  getProgress,
  listAttempts,
  listDecks,
  type AttemptRecord,
  type Progress,
} from "../api";
import BackupControls from "../components/BackupControls.vue";
import MasteryLegend from "../components/MasteryLegend.vue";
import RubyText from "../components/RubyText.vue";
import CalendarHeatmap from "../components/charts/CalendarHeatmap.vue";
import LineChart from "../components/charts/LineChart.vue";
import StackedBar from "../components/charts/StackedBar.vue";
import {
  activity,
  byDeck,
  byGroup,
  coverage,
  knownRatio,
  leastLearned,
  learnedOverTime,
  nextUp,
  statsAt,
  streaks,
  unitsOf,
  weakest,
} from "../study/analytics";
import { parseRuby } from "../study/ruby";
import { GROUP_LABELS, type Deck, type Jlpt } from "../types";

const ACTIVITY_DAYS = 12 * 7;
const WEAK_LIMIT = 10;

const decks = ref<Deck[]>([]);
const progress = ref<Progress>(emptyProgress());
const attempts = ref<AttemptRecord[]>([]);
const now = ref(Date.now());
const loaded = ref(false);
const level = ref<Jlpt>("N5");
const deckOrder = ref<"course" | "least">("course");

async function load(): Promise<void> {
  // Through the api.ts wrappers, so a server that is down falls back to local data.
  const summaries = await listDecks();
  const full = await Promise.all(summaries.map((summary) => getDeck(summary.id)));
  decks.value = full.filter((deck): deck is Deck => deck !== undefined);
  const [latest, sessions] = await Promise.all([getProgress(), listAttempts()]);
  progress.value = latest;
  attempts.value = sessions;
  now.value = Date.now();
  loaded.value = true;
}

onMounted(load);

/** Levels that have something to learn, in content order. */
const levels = computed(() => [
  ...new Set(decks.value.filter((deck) => unitsOf(deck).length).map((deck) => deck.level)),
]);

const levelDecks = computed(() => decks.value.filter((deck) => deck.level === level.value));
const stats = computed(() => statsAt(decks.value, progress.value.items, level.value));
const levelDeckIds = computed(() => new Set(levelDecks.value.map((deck) => deck.id)));
const levelAttempts = computed(() =>
  attempts.value.filter((attempt) => levelDeckIds.value.has(attempt.deckId)),
);

const headline = computed(() => coverage(decks.value, stats.value, level.value));
const percentKnown = computed(() => Math.round(knownRatio(headline.value) * 100));
const groups = computed(() => byGroup(decks.value, stats.value, level.value));
const streak = computed(() => streaks(attempts.value, now.value));
const days = computed(() => activity(levelAttempts.value, ACTIVITY_DAYS, now.value));
const learned = computed(() => learnedOverTime(stats.value, now.value));
const weak = computed(() => weakest(levelDecks.value, stats.value, WEAK_LIMIT));
const next = computed(() => nextUp(decks.value, stats.value, level.value));

const deckRows = computed(() => {
  const rows = byDeck(decks.value, stats.value, level.value);
  return deckOrder.value === "least" ? leastLearned(rows) : rows;
});

/** Nothing studied at this level yet: show the starting point, not empty charts. */
const isEmpty = computed(
  () => levelAttempts.value.length === 0 && headline.value.new === headline.value.total,
);

const periodTotals = computed(() => {
  const sessions = days.value.reduce((n, day) => n + day.sessions, 0);
  const answers = days.value.reduce((n, day) => n + day.answers, 0);
  return `${sessions} session${sessions === 1 ? "" : "s"} · ${answers.toLocaleString()} answers in the last 12 weeks`;
});

const streakLabel = computed(() => {
  const { current, longest } = streak.value;
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (!current) return longest ? `No current streak · longest ${days(longest)}` : "No study streak yet";
  return `${days(current)} in a row · longest ${days(longest)}`;
});

const nextLabel = computed(() => {
  const up = next.value;
  if (!up) return "";
  if (isEmpty.value) return `Start with ${up.deck.title}`;
  if (up.reason === "learning") return `Continue ${up.deck.title}`;
  if (up.reason === "untouched") return `Start ${up.deck.title}`;
  return `Review ${up.deck.title}`;
});

const nextNote = computed(() => {
  const up = next.value;
  if (!up) return `Every ${level.value} unit is known. おめでとう!`;
  if (up.reason === "learning") return `${up.split.learning} units in progress there.`;
  if (up.reason === "untouched") return `${up.split.total} new units.`;
  return `${up.split.total - up.split.known} units not known yet.`;
});

function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
</script>

<template>
  <main v-if="loaded" class="page dashboard">
    <section class="hero">
      <h1>Progress</h1>
      <p>A unit is <strong>known</strong> once you answer it right three times in a row.</p>
    </section>

    <div v-if="levels.length > 1" class="level-switch" role="group" aria-label="Level">
      <button
        v-for="option in levels"
        :key="option"
        class="toggle"
        type="button"
        :aria-pressed="option === level"
        @click="level = option"
      >
        {{ option }}
      </button>
    </div>

    <section class="dash-section headline">
      <h2 class="headline-count">
        {{ headline.known.toLocaleString() }} of {{ headline.total.toLocaleString() }}
        {{ level }} units known <small>({{ percentKnown }}%)</small>
      </h2>
      <StackedBar :split="headline" :height="14" />
      <MasteryLegend :split="headline" />
      <p class="streak">{{ streakLabel }}</p>
      <RouterLink
        v-if="isEmpty && next"
        class="primary"
        :to="{ name: 'deck', params: { id: next.deck.id } }"
      >
        {{ nextLabel }}
      </RouterLink>
    </section>

    <section class="dash-section">
      <h3 class="group-heading">By group</h3>
      <ul class="group-bars">
        <li v-for="row in groups" :key="row.group" class="group-bar">
          <span class="group-name">{{ GROUP_LABELS[row.group] }}</span>
          <StackedBar :split="row.split" />
          <span class="group-count">{{ row.split.known }}/{{ row.split.total }}</span>
        </li>
      </ul>
    </section>

    <template v-if="!isEmpty">
      <section class="dash-section">
        <h3 class="group-heading">Activity</h3>
        <p class="dash-note">{{ periodTotals }}</p>
        <CalendarHeatmap :days="days" />
        <p class="chart-caption">Accuracy per day</p>
        <LineChart
          :values="days.map((day) => day.accuracy)"
          :max="1"
          :format="percent"
          :start-label="shortDate(days[0]!.day)"
          end-label="Today"
          label="Share of answers right on each day of the last 12 weeks"
        />
      </section>

      <section class="dash-section">
        <h3 class="group-heading">Learned over time</h3>
        <p v-if="learned.length" class="dash-note">
          Units that have reached known at least once. A miss sends a unit back to learning, so
          this can run ahead of the count above.
        </p>
        <LineChart
          v-if="learned.length"
          :values="learned.map((point) => point.known)"
          :start-label="shortDate(learned[0]!.day)"
          end-label="Today"
          label="Units known, cumulative, by the day each was first known"
        />
        <p v-else class="dash-note">Nothing known yet. Keep going: three right in a row does it.</p>
      </section>
    </template>

    <section class="dash-section">
      <div class="section-head">
        <h3 class="group-heading">Decks</h3>
        <button
          class="ghost"
          type="button"
          @click="deckOrder = deckOrder === 'course' ? 'least' : 'course'"
        >
          {{ deckOrder === "course" ? "Sort by least learned" : "Sort in course order" }}
        </button>
      </div>
      <div class="deck-grid">
        <RouterLink
          v-for="row in deckRows"
          :key="row.deck.id"
          class="deck-tile"
          :to="{ name: 'deck', params: { id: row.deck.id } }"
        >
          <span class="deck-tile-title">{{ row.deck.title }}</span>
          <span class="deck-tile-ja">{{ row.deck.titleJa }}</span>
          <StackedBar :split="row.split" :height="6" />
          <span class="deck-tile-meta">
            {{ percent(knownRatio(row.split)) }} known · {{ row.split.total }} units
          </span>
        </RouterLink>
      </div>
    </section>

    <section v-if="weak.length" class="dash-section">
      <h3 class="group-heading">Needs work</h3>
      <ul class="weak-list">
        <li v-for="entry in weak" :key="entry.unit.id">
          <RubyText class="weak-ja" :segments="parseRuby(entry.unit.ja)" />
          <span class="weak-en">{{ entry.unit.en }}</span>
          <span class="weak-meta">
            {{ percent(entry.accuracy) }} right ({{ entry.stat.correct }}/{{ entry.stat.seen }}) ·
            <RouterLink :to="{ name: 'deck', params: { id: entry.deck.id } }">
              {{ entry.deck.title }}
            </RouterLink>
          </span>
        </li>
      </ul>
    </section>

    <section v-if="!isEmpty" class="dash-section next-up">
      <h3 class="group-heading">Next up</h3>
      <p class="dash-note">{{ nextNote }}</p>
      <RouterLink
        v-if="next"
        class="primary"
        :to="{ name: 'deck', params: { id: next.deck.id } }"
      >
        {{ nextLabel }}
      </RouterLink>
    </section>

    <BackupControls @restored="load" />
  </main>
</template>
