<script setup lang="ts">
import { settings } from "../settings";
import type { RubySegment } from "../types";

defineProps<{
  segments: RubySegment[];
}>();
</script>

<template>
  <span class="ruby-text" :class="{ 'kana-off': !settings.kana }">
    <template v-for="(part, i) in segments" :key="i">
      <span v-if="part.blank" class="blank">＿</span>
      <span
        v-else-if="settings.hints && part.en"
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
