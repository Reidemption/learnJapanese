<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { formatElapsed } from "../study/time";

/** Counts up from `startedAt` (unix millis). Display only: nothing is stored. */
const props = defineProps<{ startedAt: number }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <span class="stopwatch" role="timer" aria-label="Elapsed time">
    {{ formatElapsed(now - props.startedAt) }}
  </span>
</template>
