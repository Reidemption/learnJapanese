<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import MasteryLegend from "../components/MasteryLegend.vue";
import RubyText from "../components/RubyText.vue";
import { allDecks, emptyProgress, getProgress, type Progress } from "../api";
import { customDeck, customTags } from "../session";
import { splitOf, unitsOf } from "../study/analytics";
import { masteryOf } from "../study/mastery";
import { MODE_HINTS, MODE_LABELS, availableModes } from "../study/modes";
import { seeded } from "../study/rng";
import { parseRuby } from "../study/ruby";
import { customDeckFrom, customTitle, matchingUnits, pickUnits } from "../study/tags";
import type { Mode } from "../study/modes";
import { TAG_FACETS, TAGS, type Deck, type Jlpt, type Tag, type TagFacet } from "../types";

const FACET_LABELS: Record<TagFacet, string> = { type: "Word type", theme: "Theme" };

const router = useRouter();
const decks = ref<Deck[]>([]);
const progress = ref<Progress>(emptyProgress());
const loaded = ref(false);
const level = ref<Jlpt>("N5");
/** Changes on "New set", along with `avoid`, so the pick changes too. */
const seed = ref(Date.now() >>> 0);
const avoid = ref<ReadonlySet<string>>(new Set());

async function load(): Promise<void> {
  // Through the api.ts wrappers, so a server that is down falls back to local data.
  decks.value = await allDecks();
  progress.value = await getProgress();
  loaded.value = true;
}

onMounted(load);

/** Levels that have something to learn, in content order. */
const levels = computed(() => [
  ...new Set(decks.value.filter((deck) => unitsOf(deck).length).map((deck) => deck.level)),
]);

/** Each facet's tags that have words at this level, with how many. */
const facets = computed(() =>
  TAG_FACETS.map((facet) => ({
    facet,
    tags: (Object.keys(TAGS) as Tag[])
      .filter((tag) => TAGS[tag].facet === facet)
      .map((tag) => ({ tag, count: matchingUnits(decks.value, level.value, [tag]).length }))
      .filter((entry) => entry.count > 0),
  })),
);

const matches = computed(() => matchingUnits(decks.value, level.value, customTags.value));

const deck = computed(() => {
  const picked = pickUnits(matches.value, progress.value.items, seeded(seed.value), {
    avoid: avoid.value,
  });
  return customDeckFrom(
    decks.value,
    picked.map((unit) => unit.id),
    customTitle(customTags.value),
  );
});

const mastery = computed(() => splitOf(unitsOf(deck.value), progress.value.items));

const modes = computed(() => (deck.value.items.length ? availableModes(deck.value) : []));

const countLabel = computed(() => {
  const n = matches.value.length;
  const words = (count: number) => `${count} word${count === 1 ? "" : "s"}`;
  return `${words(n)} match · this deck takes ${deck.value.items.length}`;
});

const selectedLabel = computed(() =>
  customTags.value.map((tag) => TAGS[tag].label).join(" + "),
);

// A new selection or level starts afresh; only "New set" avoids the last pick.
watch([customTags, level], () => {
  avoid.value = new Set();
});

function toggle(tag: Tag): void {
  const on = customTags.value.includes(tag);
  customTags.value = on ? customTags.value.filter((t) => t !== tag) : [...customTags.value, tag];
}

function newSet(): void {
  avoid.value = new Set(deck.value.items.map((item) => item.id));
  seed.value = (seed.value + 1) >>> 0;
}

function start(mode: Mode): void {
  customDeck.value = deck.value;
  router.push({ name: "custom-session", params: { mode } });
}
</script>

<template>
  <main v-if="loaded" class="page custom">
    <section class="hero">
      <h1>Custom study</h1>
      <p>
        Pick tags to gather {{ level }} words from across the decks. The deck takes the words that
        need work first.
      </p>
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

    <section v-for="group in facets" :key="group.facet" class="tag-group">
      <h3 class="group-heading">{{ FACET_LABELS[group.facet] }}</h3>
      <div class="tag-chips" role="group" :aria-label="FACET_LABELS[group.facet]">
        <button
          v-for="entry in group.tags"
          :key="entry.tag"
          class="toggle tag-chip"
          type="button"
          :aria-pressed="customTags.includes(entry.tag)"
          @click="toggle(entry.tag)"
        >
          {{ TAGS[entry.tag].label }} <small>{{ entry.count }}</small>
        </button>
      </div>
    </section>
    <p class="dash-note tag-note">
      Tags in one group widen the deck (verbs <em>or</em> adverbs). Tags from both groups narrow it
      (verbs <em>about</em> time).
    </p>

    <p v-if="!customTags.length" class="prompt-en">Pick one or more tags to build a deck.</p>
    <p v-else-if="!matches.length" class="prompt-en">No {{ level }} words match {{ selectedLabel }}.</p>

    <template v-else>
      <section class="custom-summary">
        <h2>{{ deck.title }}</h2>
        <p>{{ countLabel }}</p>
        <button
          v-if="matches.length > deck.items.length"
          class="ghost"
          type="button"
          @click="newSet"
        >
          New set
        </button>
      </section>

      <p v-if="!modes.length" class="prompt-en">
        Too few words to quiz on. Add a tag from the same group to widen the deck.
      </p>
      <div v-for="mode in modes" :key="mode" class="level-row">
        <div>
          <h2>{{ MODE_LABELS[mode] }}</h2>
          <p>{{ MODE_HINTS[mode] }}</p>
        </div>
        <div class="actions">
          <button class="primary" type="button" @click="start(mode)">Start</button>
        </div>
      </div>

      <section class="preview">
        <h3 class="group-heading">In this deck</h3>
        <MasteryLegend :split="mastery" />
        <ul class="item-list">
          <li v-for="item in deck.items" :key="item.id">
            <span class="custom-word">
              <i class="swatch" :class="masteryOf(progress.items[item.id])" />
              <RubyText :segments="parseRuby(item.ja)" />
            </span>
            <span class="prompt-en">{{ item.en }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
