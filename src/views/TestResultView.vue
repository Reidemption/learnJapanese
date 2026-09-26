<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import RubyText from "../components/RubyText.vue";
import { allDecks } from "../api";
import { practiseUnits } from "../practice";
import { lastTest, wordTestUnits } from "../session";
import { MODE_LABELS } from "../study/modes";
import { parseRuby } from "../study/ruby";
import type { UnitResult } from "../study/test";
import { formatAverage, formatElapsed } from "../study/time";
import type { Deck, RubySegment } from "../types";

/** A deck test's result (`id`) or a word test's (`set`). */
const props = defineProps<{ id?: string; set?: string }>();
const router = useRouter();

const decks = ref<Deck[]>([]);
onMounted(async () => {
  decks.value = await allDecks();
});

/** Only this test's result: a refresh leaves nothing to show. */
const result = computed(() => {
  const value = lastTest.value;
  if (!value) return undefined;
  return props.id ? (value.deckId === props.id ? value : undefined) : value.set === props.set ? value : undefined;
});

const deck = computed(() => decks.value.find((d) => d.id === props.id));
const level = computed(() => deck.value?.level ?? decks.value[0]?.level ?? "N5");
const failed = computed(() => result.value?.units.filter((unit) => !unit.passed) ?? []);
const passed = computed(() => result.value?.units.filter((unit) => unit.passed) ?? []);

const backTo = computed(() =>
  props.id ? { name: "deck", params: { id: props.id } } : { name: "dashboard" },
);
const backLabel = computed(() => (props.id ? "Back to deck" : "Progress"));

type Shown = { ja: RubySegment[]; en: string };

/** Every unit's Japanese with its answer in (a cloze sentence filled in), and its English. */
const shown = computed(() => {
  const out = new Map<string, Shown>();
  for (const d of decks.value) {
    for (const item of d.items) out.set(item.id, { ja: parseRuby(item.ja), en: item.en });
    for (const q of d.questions ?? []) {
      const answer = parseRuby(q.answer);
      out.set(q.id, {
        ja: parseRuby(q.prompt).flatMap((part) => (part.blank ? answer : [part])),
        en: q.en ?? "",
      });
    }
  }
  return out;
});

/** "Missed: Reading, Recall (didn't know)". */
function missedLabel(unit: UnitResult): string {
  const parts = unit.questions
    .filter((q) => !q.correct)
    .map((q) => `${MODE_LABELS[q.question.kind]}${q.skipped ? " (didn't know)" : ""}`);
  return `Missed: ${parts.join(", ")}`;
}

const timing = computed(() => {
  const ms = result.value?.elapsedMs;
  if (ms === null || ms === undefined || !result.value) return undefined;
  return `${formatElapsed(ms)} · ${formatAverage(ms, result.value.questions)} per question`;
});

const failedIds = computed(() => failed.value.map((unit) => unit.unitId));

function practiseMissed(): void {
  if (!result.value) return;
  practiseUnits(router, decks.value, failedIds.value, `Missed in ${result.value.title}`);
}

/** A word test of just the words this deck test missed. */
function testMissed(): void {
  if (!result.value) return;
  wordTestUnits.value = { title: `Missed in ${result.value.title}`, unitIds: failedIds.value };
  void router.push({ name: "word-test", params: { set: "these" } });
}
</script>

<template>
  <main v-if="result" class="page score test-result">
    <RouterLink class="back" :to="backTo">← {{ id ? result.title : "Progress" }}</RouterLink>

    <h2>{{ passed.length }} / {{ result.units.length }}</h2>
    <p class="prompt-en">
      {{ level }} · <template v-if="!id">{{ result.title }} · </template>Test · words passed
    </p>
    <p v-if="timing" class="prompt-en test-time">Time {{ timing }}</p>

    <template v-if="failed.length">
      <h3 class="group-heading">Missed</h3>
      <ul class="misses unit-results">
        <li v-for="unit in failed" :key="unit.unitId" class="unit-result failed">
          <span class="num" aria-label="Failed">✗</span>
          <div>
            <RubyText :segments="shown.get(unit.unitId)?.ja ?? []" />
            <div class="prompt-en">{{ shown.get(unit.unitId)?.en }}</div>
            <div class="dash-note">{{ missedLabel(unit) }}</div>
          </div>
        </li>
      </ul>
    </template>
    <p v-else class="prompt-en">Every word passed.</p>

    <template v-if="passed.length">
      <h3 class="group-heading">Passed</h3>
      <ul class="misses unit-results">
        <li v-for="unit in passed" :key="unit.unitId" class="unit-result passed">
          <span class="num" aria-label="Passed">✓</span>
          <div>
            <RubyText :segments="shown.get(unit.unitId)?.ja ?? []" />
            <div class="prompt-en">{{ shown.get(unit.unitId)?.en }}</div>
          </div>
        </li>
      </ul>
    </template>

    <div class="next-row">
      <button v-if="failed.length" class="ghost" type="button" @click="practiseMissed">
        Practise the {{ failed.length }} you missed
      </button>
      <button v-if="failed.length && id" class="ghost" type="button" @click="testMissed">
        Test these
      </button>
      <RouterLink class="primary" :to="backTo">{{ backLabel }}</RouterLink>
    </div>
  </main>

  <main v-else class="page score">
    <h2>No result to show</h2>
    <p class="prompt-en">Test results live for the session only, so a refresh clears them.</p>
    <div class="next-row">
      <RouterLink class="primary" :to="backTo">{{ backLabel }}</RouterLink>
    </div>
  </main>
</template>
