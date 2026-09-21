<script setup lang="ts">
import { computed } from "vue";
import type { Split } from "../../study/analytics";

const props = withDefaults(defineProps<{ split: Split; height?: number }>(), { height: 10 });

const parts = computed(() => {
  const total = props.split.total || 1;
  let x = 0;
  return (["known", "learning", "new"] as const).map((kind) => {
    const width = (props.split[kind] / total) * 100;
    const part = { kind, x, width };
    x += width;
    return part;
  });
});

const label = computed(
  () => `${props.split.known} known, ${props.split.learning} learning, ${props.split.new} new`,
);
</script>

<template>
  <svg
    class="chart stacked-bar"
    role="img"
    :aria-label="label"
    width="100%"
    :height="height"
    preserveAspectRatio="none"
  >
    <title>{{ label }}</title>
    <!-- An empty split still draws as "all new", never as nothing. -->
    <rect v-if="split.total === 0" class="new" x="0" y="0" width="100%" height="100%" />
    <template v-for="part in parts" :key="part.kind">
      <rect
        v-if="part.width > 0"
        :class="part.kind"
        :x="`${part.x}%`"
        y="0"
        :width="`${part.width}%`"
        height="100%"
      />
    </template>
  </svg>
</template>
