<script setup lang="ts">
import { computed, inject } from "vue";
import { PRESENTATION } from "../presentation";
import { settings } from "../settings";
import type { RubySegment } from "../types";

defineProps<{
  segments: RubySegment[];
}>();

const override = inject(PRESENTATION, null);
const kana = computed(() => override?.kana ?? settings.kana);
const hints = computed(() => override?.hints ?? settings.hints);
</script>

<template>
  <span class="ruby-text" :class="{ 'kana-off': !kana }">
    <template v-for="(part, i) in segments" :key="i">
      <span v-if="part.blank" class="blank">＿</span>
      <span
        v-else-if="hints && part.en"
        class="hintable"
        tabindex="0"
      >
        <ruby v-if="part.reading">
          {{ part.ja }}<rt>{{ part.reading }}</rt>
        </ruby>
        <template v-else>{{ part.ja }}</template>
        <span class="tip">{{ part.en }}</span>
      </span>
      <ruby v-else-if="part.reading">
        {{ part.ja }}<rt>{{ part.reading }}</rt>
      </ruby>
      <template v-else>{{ part.ja }}</template>
    </template>
  </span>
</template>
