<script setup lang="ts">
import { computed } from "vue";
import type { DayActivity } from "../../study/analytics";

/** Answers per day as a GitHub-style grid: a column per week, Sunday on top. */
const props = defineProps<{ days: DayActivity[] }>();

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;

const max = computed(() => Math.max(0, ...props.days.map((d) => d.answers)));

const cells = computed(() => {
  const lead = props.days[0]?.weekday ?? 0;
  return props.days.map((day, index) => {
    const slot = index + lead;
    return {
      ...day,
      x: Math.floor(slot / 7) * STEP,
      y: (slot % 7) * STEP,
      level: day.answers === 0 ? 0 : Math.min(4, Math.ceil((day.answers / (max.value || 1)) * 4)),
    };
  });
});

const width = computed(() => {
  const last = cells.value[cells.value.length - 1];
  return (last ? last.x : 0) + CELL;
});

function title(day: DayActivity): string {
  if (!day.answers) return `${day.day}: no study`;
  const pct = Math.round((day.accuracy ?? 0) * 100);
  const sessions = `${day.sessions} session${day.sessions === 1 ? "" : "s"}`;
  return `${day.day}: ${day.answers} answers, ${pct}% right, ${sessions}`;
}
</script>

<template>
  <svg
    class="chart heatmap"
    role="img"
    :aria-label="`Answers per day over the last ${days.length} days`"
    :viewBox="`0 0 ${width} ${7 * STEP - GAP}`"
  >
    <rect
      v-for="cell in cells"
      :key="cell.day"
      :class="`heat-${cell.level}`"
      :x="cell.x"
      :y="cell.y"
      :width="CELL"
      :height="CELL"
      rx="2"
    >
      <title>{{ title(cell) }}</title>
    </rect>
  </svg>
</template>
