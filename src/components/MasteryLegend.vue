<script setup lang="ts">
import type { Split } from "../study/analytics";

defineProps<{ split: Split }>();
</script>

<template>
  <p class="mastery-legend">
    <span v-if="split.mastered"><i class="swatch mastered" />{{ split.mastered.toLocaleString() }} mastered</span>
    <span><i class="swatch known" />{{ split.known.toLocaleString() }} known</span>
    <span><i class="swatch learning" />{{ split.learning.toLocaleString() }} learning</span>
    <span><i class="swatch new" />{{ split.new.toLocaleString() }} new</span>
  </p>
</template>
